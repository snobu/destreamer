import { ApiClient } from './ApiClient';
import { argv, promptUser } from './CommandLineParser';
import { getDecrypter } from './Descrypter';
import { DownloadManager } from './DownloadManager';
import { ERROR_CODE } from './Errors';
import { setProcessEvents } from './Events';
import { logger } from './Logger';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
// import { drawThumbnail } from './Thumbnail';
import { TokenCache/* , refreshSession  */} from './TokenCache';
import { Video, Session } from './Types';
import { checkRequirements, /* ffmpegTimemarkToChunk,  */parseInputFile, parseCLIinput, getUrlsFromPlaylist} from './Utils';
import { getVideoInfo, createUniquePath } from './VideoUtils';

import { exec, execSync } from 'child_process';
import fs from 'fs';
import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import path from 'path';
import tmp from 'tmp';


const m3u8Parser: any = require('m3u8-parser'); // TODO: can we create an export or something for this?
const tokenCache: TokenCache = new TokenCache();
export const chromeCacheFolder = '.chrome_data';
tmp.setGracefulCleanup();

// const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();


async function init(): Promise<void> {
    setProcessEvents(); // must be first!

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

    const videos: Array<Video> = createUniquePath (
        await getVideoInfo(videoGUIDs, session, argv.closedCaptions),
        outputDirectories, argv.format, argv.skip
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

    // Launch aria2c
    logger.info('Trying to launch and connect to aria2c...\n');
    const aria2cExec = exec('aria2c --enable-rpc --pause=true --rpc-listen-port=6789', (err, stdout, stderr) => {
        logger.error(err?.message ?? (stderr || stdout));
        process.exit(ERROR_CODE.ARIA2C_CRASH);
    });
    // Try to connect to aria2c webSocket
    const downloadManager = new DownloadManager(6789);
    try {
        await downloadManager.init();
    }
    catch (err) {
        process.exit(ERROR_CODE.NO_CONNECT_ARIA2C);
    }
    // We are connected

    for (const video of videos) {
        const masterParser = new m3u8Parser.Parser();

        console.info(`\nDownloading video no.${videos.indexOf(video) + 1} \n`);

        // TODO: check issue
        if (argv.skip && fs.existsSync(video.outPath)) {
            logger.info(`File already exists, skipping: ${video.outPath} \n`);
            continue;
        }

        masterParser.push(await apiClient.callUrl(video.playbackUrl).then(res => res?.data));
        masterParser.end();

        // video playlist url
        let videoPlaylistUrl: string;
        let videoPlaylists: Array<any> = (masterParser.manifest.playlists as Array<any>)
            .filter(playlist =>
                Object.prototype.hasOwnProperty.call(playlist.attributes, 'RESOLUTION'));

        if (videoPlaylists.length === 1 || argv.bestQuality) {
            videoPlaylistUrl = videoPlaylists.pop().uri;
        }
        else {
            let resolutions = videoPlaylists.map(playlist =>
                playlist.attributes.RESOLUTION.width + 'x' +
                playlist.attributes.RESOLUTION.height);
            videoPlaylistUrl = videoPlaylists[promptUser(resolutions)].uri;
        }

        // audio playlist url
        // TODO: better audio playlists parsing..?
        let audioPlaylistUrl: string;
        let audioPlaylists: Array<string> = Object.keys(masterParser.manifest.mediaGroups.AUDIO.audio);

        if (audioPlaylists.length === 1 || argv.bestQuality){
            audioPlaylistUrl = masterParser.manifest.mediaGroups.AUDIO
                .audio[audioPlaylists[0]].uri;
        }
        else {
            audioPlaylistUrl = masterParser.manifest.mediaGroups.AUDIO
                .audio[audioPlaylists[promptUser(audioPlaylists)]].uri;
        }

        const videoUrls = await getUrlsFromPlaylist(videoPlaylistUrl, session);
        const audioUrls = await getUrlsFromPlaylist(audioPlaylistUrl, session);
        const decrypter = await getDecrypter(videoPlaylistUrl, session);

        // video download
        const videoSegmentsDir = tmp.dirSync({
            prefix: 'video',
            tmpdir: path.dirname(video.outPath),
            unsafeCleanup: true
        });

        logger.info('\nDownloading and merging video segments \n');
        await downloadManager.downloadUrls(videoUrls, videoSegmentsDir.name);
        execSync('copy /b *.encr ..\\video.encr', {cwd: videoSegmentsDir.name});
        videoSegmentsDir.removeCallback();


        // audio download
        const audioSegmentsDir = tmp.dirSync({
            prefix: 'audio',
            tmpdir: path.dirname(video.outPath),
            unsafeCleanup: true
        });

        logger.info('\nDownloading and merging audio segments \n');
        await downloadManager.downloadUrls(audioUrls, audioSegmentsDir.name);
        execSync('copy /b *.encr ..\\audio.encr', {cwd: audioSegmentsDir.name});
        audioSegmentsDir.removeCallback();

        // subs download
        if (argv.closedCaptions && video.captionsUrl) {
            await apiClient.callUrl(video.captionsUrl, 'get', null, 'text')
            .then(res => fs.writeFileSync('subs.vtt', res?.data));
        }

        logger.warn('START DECRYPT');

        const input = fs.createReadStream( path.join(path.dirname(video.outPath), 'video.encr'));
        const output = fs.createWriteStream(video.outPath);

        input.pipe(decrypter).pipe(output);

        logger.warn('DONE DECRYPT');

    }

    logger.debug('closing');
    await downloadManager.close();
    logger.debug('closed websocket');
    aria2cExec.kill('SIGINT');
    logger.debug('closed aria2c');
}

/*
async function downloadVideo(videoGUIDs: Array<string>, outputDirectories: Array<string>, session: Session): Promise<void> {

    logger.info('Fetching videos info... \n');
    const videos: Array<Video> = createUniquePath (
        await getVideoInfo(videoGUIDs, session, argv.closedCaptions),
        outputDirectories, argv.outputTemplate, argv.format, argv.skip
        );

    if (argv.simulate) {
        videos.forEach((video: Video) => {
            logger.info(
                '\nTitle:          '.green + video.title +
                '\nOutPath:        '.green + video.outPath +
                '\nPublished Date: '.green + video.publishDate +
                '\nPlayback URL:   '.green + video.playbackUrl +
                ((video.captionsUrl) ? ('\nCC URL:         '.green + video.captionsUrl) : '')
            );
        });

        return;
    }

    for (const [index, video] of videos.entries()) {

        if (argv.skip && fs.existsSync(video.outPath)) {
            logger.info(`File already exists, skipping: ${video.outPath} \n`);
            continue;
        }

        if (argv.keepLoginCookies && index !== 0) {
            logger.info('Trying to refresh token...');
            session = await refreshSession('https://web.microsoftstream.com/video/' + videoGUIDs[index]);
        }

        const pbar: cliProgress.SingleBar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}% {speed} {eta_formatted}',
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        logger.info(`\nDownloading Video: ${video.title} \n`);
        logger.verbose('Extra video info \n' +
        '\t Video m3u8 playlist URL: '.cyan + video.playbackUrl + '\n' +
        '\t Video tumbnail URL: '.cyan + video.posterImageUrl + '\n' +
        '\t Video subtitle URL (may not exist): '.cyan + video.captionsUrl + '\n' +
        '\t Video total chunks: '.cyan + video.totalChunks + '\n');

        logger.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...\n\n');
        if (!process.stdout.columns) {
            logger.warn(
                'Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            );
        }

        const headers: string = 'Authorization: Bearer ' + session.AccessToken;

        if (!argv.noExperiments) {
            await drawThumbnail(video.posterImageUrl, session);
        }

        const ffmpegInpt: any = new FFmpegInput(video.playbackUrl, new Map([
            ['headers', headers]
        ]));
        const ffmpegOutput: any = new FFmpegOutput(video.outPath, new Map([
            argv.acodec === 'none' ? ['an', null] : ['c:a', argv.acodec],
            argv.vcodec === 'none' ? ['vn', null] : ['c:v', argv.vcodec],
            ['n', null]
        ]));
        const ffmpegCmd: any = new FFmpegCommand();

        const cleanupFn: () => void = () => {
            pbar.stop();

           if (argv.noCleanup) {
               return;
           }

            try {
                fs.unlinkSync(video.outPath);
            }
            catch (e) {
                // Future handling of an error (maybe)
            }
        };

        pbar.start(video.totalChunks, 0, {
            speed: '0'
        });

        // prepare ffmpeg command line
        ffmpegCmd.addInput(ffmpegInpt);
        ffmpegCmd.addOutput(ffmpegOutput);
        if (argv.closedCaptions && video.captionsUrl) {
            const captionsInpt: any = new FFmpegInput(video.captionsUrl, new Map([
                ['headers', headers]
            ]));

            ffmpegCmd.addInput(captionsInpt);
        }

        ffmpegCmd.on('update', async (data: any) => {
            const currentChunks: number = ffmpegTimemarkToChunk(data.out_time);

            pbar.update(currentChunks, {
                speed: data.bitrate
            });

            // Graceful fallback in case we can't get columns (Cygwin/MSYS)
            if (!process.stdout.columns) {
                process.stdout.write(`--- Speed: ${data.bitrate}, Cursor: ${data.out_time}\r`);
            }
        });

        process.on('SIGINT', cleanupFn);

        // let the magic begin...
        await new Promise((resolve: any) => {
            ffmpegCmd.on('error', (error: any) => {
                cleanupFn();

                logger.error(`FFmpeg returned an error: ${error.message}`);
                process.exit(ERROR_CODE.UNK_FFMPEG_ERROR);
            });

            ffmpegCmd.on('success', () => {
                pbar.update(video.totalChunks); // set progress bar to 100%
                logger.info(`\nDownload finished: ${video.outPath} \n`);
                resolve();
            });

            ffmpegCmd.spawn();
        });

        process.removeListener('SIGINT', cleanupFn);
    }
}*/



async function main(): Promise<void> {
    await init(); // must be first

    let session: Session;
    session = tokenCache.Read() ?? await DoInteractiveLogin('https://web.microsoftstream.com/', argv.username);

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


    /* FIXME: [FATAL] we have 4 lingering socket connections and
    I can't figure them out.
    To see them use debug mode and after execution (I suggested using
    --simulate) use 'process._getActiveHandles();' and
    'process._getActiveRequests();' in the debug console to see lingering
    Handles (where you can find the sockets) or Requests */
    await downloadVideo(videoGUIDs, outDirs, session);
}


main();
