import {
    sleep, parseVideoUrls, checkRequirements, makeUniqueTitle, ffmpegTimemarkToChunk,
    makeOutputDirectories, getOutputDirectoriesList, checkOutDirsUrlsMismatch
} from './Utils';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { setProcessEvents } from './Events';
import { ERROR_CODE } from './Errors';
import { TokenCache } from './TokenCache';
import { getVideoMetadata } from './Metadata';
import { Metadata, Session } from './Types';
import { drawThumbnail } from './Thumbnail';
import { argv } from './CommandLineParser';

import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import colors from 'colors';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import sanitize from 'sanitize-filename';
import cliProgress from 'cli-progress';

const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();
const tokenCache = new TokenCache();

async function init() {
    setProcessEvents(); // must be first!

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
    const videoId = url.split("/").pop() ?? process.exit(ERROR_CODE.INVALID_VIDEO_ID)

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

async function downloadVideo(videoUrls: string[], outputDirectories: string[], session: Session) {
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

        return;
    }

    if (argv.verbose)
        console.log(outputDirectories);

    let refreshTokenInterval: object | null = null;

    const outDirsIdxInc = outputDirectories.length > 1 ? 1:0;
    for (let i=0, j=0, l=metadata.length; i<l; ++i, j+=outDirsIdxInc) {
        const video = metadata[i];
        const pbar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}% {speed} {eta_formatted}',
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        console.log(colors.yellow(`\nDownloading Video: ${video.title}\n`));

        video.title = makeUniqueTitle(sanitize(video.title) + ' - ' + video.date, outputDirectories[j]);

        // Very experimental inline thumbnail rendering
        if (!argv.noExperiments)
            await drawThumbnail(video.posterImage, session.AccessToken);

        console.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...');
        if (!process.stdout.columns) {
            console.info(colors.red('Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'));
        }

        // Try to get a fresh cookie, else gracefully fall back
        // to our session access token (Bearer)
        let freshCookie = await tokenCache.RefreshToken(session);

        // Don't remove the "useless" escapes otherwise ffmpeg will
        // not pick up the header
        // eslint-disable-next-line no-useless-escape
        let headers = `Authorization:\ Bearer\ ${session.AccessToken}`;
        if (freshCookie) {
            console.info(colors.green('Using a fresh cookie.'));
            // eslint-disable-next-line no-useless-escape
            headers = `Cookie:\ ${freshCookie}`;
        }

        const outputPath = outputDirectories[j] + path.sep + video.title + '.mp4';
        const ffmpegInpt = new FFmpegInput(video.playbackUrl, new Map([
            ['headers', headers]
        ]));
        const ffmpegOutput = new FFmpegOutput(outputPath);
        const ffmpegCmd = new FFmpegCommand();
        
        const cleanupFn = function () {
            pbar.stop();

            try {
                fs.unlinkSync(outputPath);
            } catch(e) {}
        }

        pbar.start(video.totalChunks, 0, {
            speed: '0'
        });

        // prepare ffmpeg command line
        ffmpegCmd.addInput(ffmpegInpt);
        ffmpegCmd.addOutput(ffmpegOutput);

        ffmpegCmd.on('update', (data: any) => {
            if (!refreshTokenInterval) {
                refreshTokenInterval = setInterval(async () => {
                    let date = new Date();
                    process.stdout.write('\n[ Refreshed cookie at ' +
                        `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ]\n`);
                    freshCookie = await tokenCache.RefreshToken(session);
                }, 5 * 1000);
            }

            const currentChunks = ffmpegTimemarkToChunk(data.out_time);

            pbar.update(currentChunks, {
                speed: data.bitrate
            });

            // Graceful fallback in case we can't get columns (Cygwin/MSYS)
            if (!process.stdout.columns) {
                process.stdout.write(`--- Speed: ${data.bitrate}, Cursor: ${data.out_time}\r`);
            }
        });

        ffmpegCmd.on('error', (error: any) => {
            pbar.stop();

            try {
                fs.unlinkSync(outputPath);
            } catch (e) {}

            console.log(`\nffmpeg returned an error: ${error.message}`);
            process.exit(ERROR_CODE.UNK_FFMPEG_ERROR);
        });

        process.on('SIGINT', cleanupFn);

        // let the magic begin...
        await new Promise((resolve: any, reject: any) => {
            ffmpegCmd.on('success', (data:any) => {
                pbar.update(video.totalChunks); // set progress bar to 100%
                console.log(colors.green(`\nDownload finished: ${outputPath}`));
                resolve();
            });

            ffmpegCmd.spawn();
        });
        
        process.removeListener('SIGINT', cleanupFn);
    }
}

async function main() {
    await init(); // must be first

    const outDirs: string[] = getOutputDirectoriesList(argv.outputDirectory as string);
    const videoUrls: string[] = parseVideoUrls(argv.videoUrls);
    let session: Session;

    checkOutDirsUrlsMismatch(outDirs, videoUrls);
    makeOutputDirectories(outDirs); // create all dirs now to prevent ffmpeg panic

    session = tokenCache.Read() ?? await DoInteractiveLogin(videoUrls[0], argv.username);

    downloadVideo(videoUrls, outDirs, session);
}


main();
