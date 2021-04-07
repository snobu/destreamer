import { ApiClient } from './ApiClient';
import { argv, promptUser } from './CommandLineParser';
import { getDecrypter } from './Decrypter';
import { DownloadManager } from './DownloadManager';
import { ERROR_CODE } from './Errors';
import { setProcessEvents } from './Events';
import { logger } from './Logger';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { drawThumbnail } from './Thumbnail';
import { TokenCache, refreshSession} from './TokenCache';
import { Video, Session } from './Types';
import { checkRequirements, parseInputFile, parseCLIinput, getUrlsFromPlaylist} from './Utils';
import { getVideosInfo, createUniquePaths } from './VideoUtils';

import { spawn, execSync, ChildProcess } from 'child_process';
import fs from 'fs';
import isElevated from 'is-elevated';
import portfinder from 'portfinder';
import puppeteer from 'puppeteer';
import path from 'path';
import tmp from 'tmp';


// TODO: can we create an export or something for this?
const m3u8Parser: any = require('m3u8-parser');
const tokenCache: TokenCache = new TokenCache();
const downloadManager = new DownloadManager();
export const chromeCacheFolder = '.chrome_data';
tmp.setGracefulCleanup();


async function init(): Promise<void> {
    setProcessEvents();     // must be first!

    logger.level = argv.debug ? 'debug' : (argv.verbose ? 'verbose' : 'info');

    if (await isElevated()) {
        process.exit(ERROR_CODE.ELEVATED_SHELL);
    }

    checkRequirements();

    if (argv.username) {
        logger.info(`Username: ${argv.username}`);
    }

    if (argv.simulate) {
        logger.warn('Simulate mode, there will be no video downloaded. \n');
    }
}


async function DoInteractiveLogin(url: string, username?: string): Promise<Session> {

    logger.info('Launching headless Chrome to perform the OpenID Connect dance...');

    const browser: puppeteer.Browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        userDataDir: (argv.keepLoginCookies) ? chromeCacheFolder : undefined,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });
    const page: puppeteer.Page = (await browser.pages())[0];

    logger.info('Navigating to login page...');
    await page.goto(url, { waitUntil: 'load' });

    try {
        if (username) {
            await page.waitForSelector('input[type="email"]', {timeout: 3000});
            await page.keyboard.type(username);
            await page.click('input[type="submit"]');
        }
        else {
            /* If a username was not provided we let the user take actions that
            lead up to the video page. */
        }
    }
    catch (e) {
        /* If there is no email input selector we aren't in the login module,
        we are probably using the cache to aid the login.
        It could finish the login on its own if the user said 'yes' when asked to
        remember the credentials or it could still prompt the user for a password */
    }

    await browser.waitForTarget((target: puppeteer.Target) => target.url().endsWith('microsoftstream.com/'), { timeout: 150000 });
    logger.info('We are logged in.');

    let session: Session | null = null;
    let tries = 1;
    while (!session) {
        try {
            let sessionInfo: any;
            session = await page.evaluate(
                () => {
                    return {
                        AccessToken: sessionInfo.AccessToken,
                        ApiGatewayUri: sessionInfo.ApiGatewayUri,
                        ApiGatewayVersion: sessionInfo.ApiGatewayVersion
                    };
                }
            );
        }
        catch (error) {
            if (tries > 5) {
                process.exit(ERROR_CODE.NO_SESSION_INFO);
            }

            session = null;
            tries++;
            await page.waitFor(3000);
        }
    }

    tokenCache.Write(session);
    logger.info('Wrote access token to token cache.');
    logger.info("At this point Chromium's job is done, shutting it down... \n\n");

    await browser.close();

    return session;
}

async function downloadVideo(videoGUIDs: Array<string>,
    outputDirectories: Array<string>, session: Session): Promise<void> {

    const apiClient = ApiClient.getInstance(session);

    logger.info('Downloading video info, this might take a while...');

    const videos: Array<Video> = createUniquePaths (
        await getVideosInfo(videoGUIDs, session, argv.closedCaptions),
        outputDirectories, argv.outputTemplate ,argv.format, argv.skip
    );

    if (argv.simulate) {
        videos.forEach(video => {
            logger.info(
                '\nTitle:          '.green + video.title +
                '\nOutPath:        '.green + video.outPath +
                '\nPublished Date: '.green + video.publishDate + ' ' + video.publishTime +
                '\nPlayback URL:   '.green + video.playbackUrl +
                ((video.captionsUrl) ? ('\nCC URL:         '.green + video.captionsUrl) : '')
            );
        });

        return;
    }

    logger.info('Trying to launch and connect to aria2c...\n');


    /* FIXME: aria2Exec must be defined here for the scope but later on it's complaining that it's not
    initialized even if we never reach line#361 if we fail the assignment here*/
    let aria2cExec: ChildProcess;
    let arai2cExited = false;
    await portfinder.getPortPromise({ port: 6800 }).then(
        async (port: number) => {
            logger.debug(`[DESTREAMER] Trying to use port ${port}`);
            // Launch aria2c
            aria2cExec = spawn(
                'aria2c',
                ['--pause=true', '--enable-rpc', '--allow-overwrite=true', '--auto-file-renaming=false', `--rpc-listen-port=${port}`],
                {stdio: 'ignore'}
            );

            aria2cExec.on('exit', (code: number | null, signal: string) => {
                if (code === 0) {
                    logger.verbose('Aria2c process exited');
                    arai2cExited = true;
                }
                else {
                    logger.error(`aria2c exit code: ${code}` + '\n' + `aria2c exit signal: ${signal}`);
                    process.exit(ERROR_CODE.ARIA2C_CRASH);
                }
            });

            aria2cExec.on('error', (err) => {
                logger.error(err as Error);
            });

            // init webSocket
            await downloadManager.init(port, );
            // We are connected
        },
        error => {
            logger.error(error);
            process.exit(ERROR_CODE.NO_DAEMON_PORT);
        }
    );

    for (const video of videos) {
        const masterParser = new m3u8Parser.Parser();

        logger.info(`\nDownloading video no.${videos.indexOf(video) + 1} \n`);

        if (argv.skip && fs.existsSync(video.outPath)) {
            logger.info(`File already exists, skipping: ${video.outPath} \n`);
            continue;
        }

        const [isSessionExpiring] = tokenCache.isExpiring(session);
        if (argv.keepLoginCookies && isSessionExpiring) {
            logger.info('Trying to refresh access token...');
            session = await refreshSession('https://web.microsoftstream.com/');
            apiClient.setSession(session);
        }

        masterParser.push(await apiClient.callUrl(video.playbackUrl).then(res => res?.data));
        masterParser.end();

        // video playlist url
        let videoPlaylistUrl: string;
        const videoPlaylists: Array<any> = (masterParser.manifest.playlists as Array<any>)
            .filter(playlist =>
                Object.prototype.hasOwnProperty.call(playlist.attributes, 'RESOLUTION'));

        if (videoPlaylists.length === 1 || argv.selectQuality === 10) {
            videoPlaylistUrl = videoPlaylists.pop().uri;
        }
        else if (argv.selectQuality === 0) {
            const resolutions = videoPlaylists.map(playlist =>
                playlist.attributes.RESOLUTION.width + 'x' +
                playlist.attributes.RESOLUTION.height
            );

            videoPlaylistUrl = videoPlaylists[promptUser(resolutions)].uri;
        }
        else {
            let choiche = Math.round((argv.selectQuality * videoPlaylists.length) / 10);
            if (choiche === videoPlaylists.length) {
                choiche--;
            }
            logger.debug(`Video quality choiche: ${choiche}`);
            videoPlaylistUrl = videoPlaylists[choiche].uri;
        }

        // audio playlist url
        // TODO: better audio playlists parsing? With language maybe?
        const audioPlaylists: Array<string> =
            Object.keys(masterParser.manifest.mediaGroups.AUDIO.audio);
        const audioPlaylistUrl: string =
            masterParser.manifest.mediaGroups.AUDIO.audio[audioPlaylists[0]].uri;
        // if (audioPlaylists.length === 1){
        //     audioPlaylistUrl = masterParser.manifest.mediaGroups.AUDIO
        //         .audio[audioPlaylists[0]].uri;
        // }
        // else {
        //     audioPlaylistUrl = masterParser.manifest.mediaGroups.AUDIO
        //         .audio[audioPlaylists[promptUser(audioPlaylists)]].uri;
        // }

        const videoUrls = await getUrlsFromPlaylist(videoPlaylistUrl, session);
        const audioUrls = await getUrlsFromPlaylist(audioPlaylistUrl, session);
        const videoDecrypter = await getDecrypter(videoPlaylistUrl, session);
        const audioDecrypter = await getDecrypter(videoPlaylistUrl, session);

        if (!argv.noExperiments) {
            await drawThumbnail(video.posterImageUrl, session);
        }

        // video download
        const videoSegmentsDir = tmp.dirSync({
            prefix: 'video',
            tmpdir: path.dirname(video.outPath),
            unsafeCleanup: true
        });

        logger.info('\nDownloading video segments \n');
        await downloadManager.downloadUrls(videoUrls, videoSegmentsDir.name);

        // audio download
        const audioSegmentsDir = tmp.dirSync({
            prefix: 'audio',
            tmpdir: path.dirname(video.outPath),
            unsafeCleanup: true
        });

        logger.info('\nDownloading audio segments \n');
        await downloadManager.downloadUrls(audioUrls, audioSegmentsDir.name);

        // subs download
        if (argv.closedCaptions && video.captionsUrl) {
            logger.info('\nDownloading subtitles \n');
            await apiClient.callUrl(video.captionsUrl, 'get', null, 'text')
            .then(res => fs.writeFileSync(
                path.join(videoSegmentsDir.name, 'CC.vtt'), res?.data));
        }

        logger.info('\n\nMerging and decrypting video and audio segments...\n');

        const cmd = (process.platform == 'win32') ? 'copy /b *.encr ' : 'cat *.encr > ';

        execSync(cmd + `"${video.filename}.video.encr"`, { cwd: videoSegmentsDir.name });
        const videoDecryptInput = fs.createReadStream(
            path.join(videoSegmentsDir.name, video.filename + '.video.encr'));
        const videoDecryptOutput = fs.createWriteStream(
            path.join(videoSegmentsDir.name, video.filename + '.video'));

        const decryptVideoPromise = new Promise(resolve => {
            videoDecryptOutput.on('finish', resolve);
            videoDecryptInput.pipe(videoDecrypter).pipe(videoDecryptOutput);
        });

        execSync(cmd + `"${video.filename}.audio.encr"`, {cwd: audioSegmentsDir.name});
        const audioDecryptInput = fs.createReadStream(
            path.join(audioSegmentsDir.name, video.filename + '.audio.encr'));
        const audioDecryptOutput = fs.createWriteStream(
            path.join(audioSegmentsDir.name, video.filename + '.audio'));

        const decryptAudioPromise = new Promise(resolve => {
            audioDecryptOutput.on('finish', resolve);
            audioDecryptInput.pipe(audioDecrypter).pipe(audioDecryptOutput);
        });

        await Promise.all([decryptVideoPromise, decryptAudioPromise]);

        logger.info('Decrypted!\n');

        logger.info('Merging video and audio together...\n');
        const mergeCommand = (
            // add video input
            `ffmpeg -i "${path.join(videoSegmentsDir.name, video.filename + '.video')}" ` +
            // add audio input
            `-i "${path.join(audioSegmentsDir.name, video.filename + '.audio')}" ` +
            // add subtitles input if present and wanted
            ((argv.closedCaptions && video.captionsUrl) ?
                `-i "${path.join(videoSegmentsDir.name, 'CC.vtt')}" ` : '') +
            // copy codec and output path
            `-c copy "${video.outPath}"`
        );

        logger.debug('[destreamer] ' + mergeCommand);

        execSync(mergeCommand, { stdio: 'ignore' });

        logger.info('Done! Removing temp files...\n');

        videoSegmentsDir.removeCallback();
        audioSegmentsDir.removeCallback();

        logger.info(`Video no.${videos.indexOf(video) + 1} downloaded!!\n\n`);
    }

    logger.info('Exiting, this will take some seconds...');

    logger.debug('[destreamer] closing downloader socket');
    await downloadManager.close();
    logger.debug('[destreamer] closed downloader. Waiting aria2c deamon exit');
    let tries = 0;
    while (!arai2cExited) {
        if (tries < 10) {
            tries++;
            await new Promise(r => setTimeout(r, 1000));
        }
        else {
            aria2cExec!.kill('SIGINT');
        }
    }
    logger.debug('[destreamer] stopped aria2c');

    return;
}


async function main(): Promise<void> {
    await init(); // must be first


    const session: Session = tokenCache.Read() ??
        await DoInteractiveLogin('https://web.microsoftstream.com/', argv.username);

    logger.verbose('Session and API info \n' +
        '\t API Gateway URL: '.cyan + session.ApiGatewayUri + '\n' +
        '\t API Gateway version: '.cyan + session.ApiGatewayVersion + '\n');

    let videoGUIDs: Array<string>;
    let outDirs: Array<string>;

    if (argv.videoUrls) {
        logger.info('Parsing video/group urls');
        [videoGUIDs, outDirs] =  await parseCLIinput(argv.videoUrls as Array<string>, argv.outputDirectory, session);
    }
    else {
        logger.info('Parsing input file');
        [videoGUIDs, outDirs] =  await parseInputFile(argv.inputFile!, argv.outputDirectory, session);
    }

    logger.verbose('List of videos and corresponding output directory \n' +
        videoGUIDs.map((guid: string, i: number) =>
            `\thttps://web.microsoftstream.com/video/${guid} => ${outDirs[i]} \n`).join(''));


    // fuck you bug, I WON!!!
    await downloadVideo(videoGUIDs, outDirs, session);
}


main();
