import {
    sleep, parseVideoUrls, checkRequirements, makeUniqueTitle, // ffmpegTimemarkToChunk,
    makeOutputDirectories, getOutputDirectoriesList, checkOutDirsUrlsMismatch,
    createTmpDirectory, removeDirectory
} from './Utils';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { setProcessEvents } from './Events';
import { ERROR_CODE } from './Errors';
import { TokenCache } from './TokenCache';
import { getVideoMetadata } from './Metadata';
import { Metadata, Session, PlaylistType } from './Types';
import { drawThumbnail } from './Thumbnail';
import { argv, askUserChoiche } from './CommandLineParser';

import isElevated from 'is-elevated';
import axios from 'axios';
import puppeteer from 'puppeteer';
import colors from 'colors';
import path from 'path';
import fs from 'fs-extra';
import { URL } from 'url';
import { execSync } from 'child_process';
import sanitize from 'sanitize-filename';


const m3u8Parser = require('m3u8-parser'); // TODO: can we create an export or something for this?


const tokenCache = new TokenCache();


async function init() {
    setProcessEvents();

    if (await isElevated())
        process.exit(ERROR_CODE.ELEVATED_SHELL);

    checkRequirements();

    if (argv.username)
        console.info('Username: %s', argv.username);

    if (argv.simulate)
        console.info(colors.yellow('Simulate mode, there will be no video download.\n'));

    if (argv.verbose) {
        console.info('Video URLs:');
        console.info(argv.videoUrls);
    }
}

async function DoInteractiveLogin(url: string, username?: string): Promise<Session> {
    const videoId = url.split('/').pop() ?? process.exit(ERROR_CODE.INVALID_VIDEO_ID);

    console.log('Launching headless Chrome to perform the OpenID Connect dance...');
    const browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        args: ['--disable-dev-shm-usage']
    });
    const page = (await browser.pages())[0];
    console.log('Navigating to login page...');

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('input[type="email"]');

    if (username) {
        await page.keyboard.type(username);
        await page.click('input[type="submit"]');
    }

    await browser.waitForTarget(target => target.url().includes(videoId), { timeout: 150000 });
    console.info('We are logged in.');

    let session = null;
    let tries: number = 1;

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
        } catch (error) {
            if (tries > 5)
                process.exit(ERROR_CODE.NO_SESSION_INFO);

            session = null;
            tries++;
            await sleep(3000);
        }
    }

    tokenCache.Write(session);
    console.log('Wrote access token to token cache.');
    console.log("At this point Chromium's job is done, shutting it down...\n");

    await browser.close();

    return session;
}

function extractVideoGuid(videoUrls: string[]): string[] {
    const videoGuids: string[] = [];
    let guid: string | undefined = '';

    for (const url of videoUrls) {
        try {
            const urlObj = new URL(url);
            guid = urlObj.pathname.split('/').pop();
        } catch (e) {
            console.error(`Unrecognized URL format in ${url}: ${e.message}`);
            process.exit(ERROR_CODE.INVALID_VIDEO_GUID);
        }

        if (guid)
            videoGuids.push(guid);
    }

    if (argv.verbose) {
        console.info('Video GUIDs:');
        console.info(videoGuids);
    }

    return videoGuids;
}

/**
 * TODO: aria2c wraper?? or maybe JSON-RPC via WebSocket for callback from server?
 * TODO: implement aria2c arguments? (now using defaults for testing,
 *       we could ramp up to maybe 8 parallel connections)
 */
async function createPLaylists(url: string, type: PlaylistType, session: Session) {

    let playlist: string = await axios.get(url,
        {
            headers: {
                Authorization: `Bearer ${session.AccessToken}`
            }
        }).then((response) => {
            return response.data;
        });

    fs.writeFileSync(`${argv.tmpDirectory}/${type}.m3u8`, playlist);
    fs.writeFileSync(`${argv.tmpDirectory}/${type}Local.m3u8`,
        playlist.replace(/http.*Fragments/g, `${type}/Fragments`)
        .replace(/URI=".*"/, 'URI=.key'));


    if (type === 'video'){
        const videoParser = new m3u8Parser.Parser();
        videoParser.push(playlist);
        videoParser.end();

        return videoParser.manifest.segments[0].key.uri;
    }
}


async function downloadVideo(videoUrls: string[], outDirs: string[], session: Session) {

    const videoGuids = extractVideoGuid(videoUrls);
    console.log('Fetching metadata...');
    const metadata: Metadata[] = await getVideoMetadata(videoGuids, session, argv.verbose);

    if (argv.simulate) {
        metadata.forEach(video => {
            console.log(
                colors.yellow('\n\nTitle: ') + colors.green(video.title) +
                colors.yellow('\nPublished Date: ') + colors.green(video.date) +
                colors.yellow('\nPlayback URL: ') + colors.green(video.playbackUrl)
            );
        });
    }

    if (argv.verbose)
        console.log(`outputDirectories: ${outDirs}`);

    const outDirsIdxInc = outDirs.length > 1 ? 1:0;
    for (let i=0, j=0; i < metadata.length; ++i, j+=outDirsIdxInc) {
        createTmpDirectory(argv.tmpDirectory);
        const masterParser = new m3u8Parser.Parser();

        const video = metadata[i];

        console.log(colors.yellow(`\nDownloading Video: ${video.title}\n`));
        video.title = makeUniqueTitle(sanitize(video.title) + ' - ' + video.date, outDirs[j]);
        const outputPath = outDirs[j] + path.sep + video.title + '.mp4';

        if (!argv.noExperiments)
            await drawThumbnail(video.posterImage, session.AccessToken);

        let master = await axios.get(video.playbackUrl,
            {
                headers: {
                    Authorization: `Bearer ${session.AccessToken}`
                }
            }).then((response) => {
                return response.data;
            });
        masterParser.push(master);
        masterParser.end();
        fs.writeFileSync(`${argv.tmpDirectory}/master.json`,
            JSON.stringify(masterParser.manifest, undefined, 4));

        let videoUrl: string = '';
        let videoResolutions: Array<string> = [];
        for (const playlist of masterParser.manifest.playlists) {
            if (Object.prototype.hasOwnProperty.call(playlist.attributes, 'RESOLUTION')) {
                videoResolutions.push(
                    `${playlist.attributes.RESOLUTION.width}x${playlist.attributes.RESOLUTION.height}`);
            }
        }
        if (videoResolutions.length === 1)
            videoUrl = masterParser.manifest.playlists[0].uri;
        else
            videoUrl = masterParser.manifest.playlists[askUserChoiche(videoResolutions)].uri;

        let audioUrl: string = '';
        let audioChoiches = Object.keys(masterParser.manifest.mediaGroups.AUDIO.audio);
        if (audioChoiches.length === 1){
            audioUrl = masterParser.manifest.mediaGroups.AUDIO
                .audio[audioChoiches[0]].uri;
        } else {
            audioUrl = masterParser.manifest.mediaGroups.AUDIO
                .audio[audioChoiches[askUserChoiche(audioChoiches)]].uri;
        }

        const keyUrl: string = await createPLaylists(videoUrl, 'video', session);
        await createPLaylists(audioUrl, 'audio', session);

        let key: ArrayBuffer = await axios.get(keyUrl,
            {
                headers:{
                    Authorization: `Bearer ${session.AccessToken}`
                },
                responseType: 'arraybuffer'
            }).then((response) => {
                return response.data;
            });

        fs.writeFileSync(`${argv.tmpDirectory}/.key`, key);

        let aria2c = `aria2c -i "${argv.tmpDirectory}/video.m3u8" -d "${argv.tmpDirectory}/video"`;
        execSync(aria2c, {stdio: 'inherit'});
        aria2c = `aria2c -i "${argv.tmpDirectory}/audio.m3u8" -d "${argv.tmpDirectory}/audio"`;
        execSync(aria2c, {stdio: 'inherit'});

        let ffmpeg = `ffmpeg -allowed_extensions ALL -i "${argv.tmpDirectory}/videoLocal.m3u8" -allowed_extensions ALL -i "${argv.tmpDirectory}/audioLocal.m3u8" -c copy "${outputPath}"`;
        execSync(ffmpeg, {stdio: 'inherit'});
        removeDirectory(argv.tmpDirectory);
    }

}

async function main() {
    await init();

    const outDirs: string[] = getOutputDirectoriesList(argv.outputDirectory as string);
    const videoUrls: string[] = parseVideoUrls(argv.videoUrls);
    let session: Session;

    checkOutDirsUrlsMismatch(outDirs, videoUrls);
    makeOutputDirectories(outDirs);

    session = tokenCache.Read() ?? await DoInteractiveLogin(videoUrls[0], argv.username);

    downloadVideo(videoUrls, outDirs, session);
}


main();
