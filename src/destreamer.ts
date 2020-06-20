import { checkRequirements, ffmpegTimemarkToChunk,
    parseInputFile, sanitizeUrls } from './Utils';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { setProcessEvents } from './Events';
import { ERROR_CODE } from './Errors';
import { TokenCache, refreshSession } from './TokenCache';
import { getVideoInfo, createUniquePath } from './VideoUtils';
import { Video, Session } from './Types';
import { drawThumbnail } from './Thumbnail';
import { argv } from './CommandLineParser';

import puppeteer from 'puppeteer';
import isElevated from 'is-elevated';
import colors from 'colors';
import fs from 'fs';
import { URL } from 'url';
import cliProgress from 'cli-progress';

const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();
const tokenCache = new TokenCache();

// TODO: better verbose logging (maybe implement a logger?)


async function init() {
    setProcessEvents(); // must be first!

    if (await isElevated()) {
        process.exit(ERROR_CODE.ELEVATED_SHELL);
    }

    checkRequirements();

    if (argv.username) {
        console.info('Username: %s', argv.username);
    }

    if (argv.simulate) {
        console.info(colors.yellow('Simulate mode, there will be no video download.\n'));
    }
}


async function DoInteractiveLogin(url: string, username?: string): Promise<Session> {
    const videoId = url.split('/').pop() ?? process.exit(ERROR_CODE.INVALID_VIDEO_ID);

    console.log('Launching headless Chrome to perform the OpenID Connect dance...');

    const browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        userDataDir: (argv.keepLoginData) ? './chrome_data' : undefined,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });
    const page = (await browser.pages())[0];

    console.log('Navigating to login page...');
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
    console.log('Wrote access token to token cache.');
    console.log("At this point Chromium's job is done, shutting it down...\n");

    await browser.close();

    return session;
}


function extractVideoGuid(videoUrls: Array<string>): Array<string> {
    const videoGuids: Array<string> = [];
    let guid: string | undefined = '';

    for (const url of videoUrls) {
        try {
            const urlObj = new URL(url);
            guid = urlObj.pathname.split('/').pop();
        }
        catch (e) {
            console.error(`Unrecognized URL format in ${url}: ${e.message}`);
            process.exit(ERROR_CODE.INVALID_VIDEO_GUID);
        }

        if (guid) {
            videoGuids.push(guid);
        }
    }

    return videoGuids;
}


async function downloadVideo(videoUrls: Array<string>, outputDirectories: Array<string>, session: Session) {

    const videoGuids = extractVideoGuid(videoUrls);

    console.log('Fetching videos info...');
    const videos: Array<Video> = createUniquePath (
        await getVideoInfo(videoGuids, session, argv.closedCaptions),
        outputDirectories, argv.format, argv.skip
        );

    if (argv.simulate) {
        videos.forEach(video => {
            console.log(
                '\nTitle: '.green           + video.title +
                '\nOutPath: '.green         + video.outPath +
                '\nPublished Date: '.green  + video.date +
                '\nPlayback URL: '.green    + video.playbackUrl +
                ((video.captionsUrl) ? ('\nCC URL: '.green + video.captionsUrl) : '')
            );
        });

        return;
    }

    for (const video of videos) {

        if (argv.skip && fs.existsSync(video.outPath)) {
            console.log(`\nFile already exists, skipping: ${video.outPath}`.cyan);
            continue;
        }

        if (argv.keepLoginData) {
            console.log(colors.yellow('Trying to refresh token...'));
            session = await refreshSession(videoUrls[0]);
        }

        const pbar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}% {speed} {eta_formatted}',
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        console.log('\nDownloading Video: '.yellow + video.title + '\n');
        console.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...');
        if (!process.stdout.columns) {
            console.info(colors.red(
            'Unable to get number of columns from terminal.\n' +
            'This happens sometimes in Cygwin/MSYS.\n' +
            'No progress bar can be rendered, however the download process should not be affected.\n\n' +
            'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            ));
        }

        const headers = 'Authorization: Bearer ' + session.AccessToken;

        if (!argv.noExperiments) {
            await drawThumbnail(video.posterImage, session);
        }

        const ffmpegInpt = new FFmpegInput(video.playbackUrl, new Map([
            ['headers', headers]
        ]));
        const ffmpegOutput = new FFmpegOutput(video.outPath, new Map([
            argv.acodec === 'none' ? ['an', null] : ['c:a', argv.acodec],
            argv.vcodec === 'none' ? ['vn', null] : ['c:v', argv.vcodec],
            ['n', null]
        ]));
        const ffmpegCmd = new FFmpegCommand();

        const cleanupFn = (): void => {
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
            const captionsInpt = new FFmpegInput(video.captionsUrl, new Map([
                ['headers', headers]
            ]));

            ffmpegCmd.addInput(captionsInpt);
        }

        ffmpegCmd.on('update', async (data: any) => {
            const currentChunks = ffmpegTimemarkToChunk(data.out_time);

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

                console.log(`\nffmpeg returned an error: ${error.message}`);
                process.exit(ERROR_CODE.UNK_FFMPEG_ERROR);
            });

            ffmpegCmd.on('success', () => {
                pbar.update(video.totalChunks); // set progress bar to 100%
                console.log(colors.green(`\nDownload finished: ${video.outPath}`));
                resolve();
            });

            ffmpegCmd.spawn();
        });

        process.removeListener('SIGINT', cleanupFn);
    }
}


async function main() {
    await init(); // must be first

    let videoUrls: Array<string>;
    let outDirs: Array<string> = [];

    if (argv.videoUrls) {
        videoUrls = sanitizeUrls(argv.videoUrls.map(item => item as string));
        outDirs = new Array(videoUrls.length).fill(argv.outputDirectory);
    }
    else {
        [videoUrls, outDirs] =  parseInputFile(argv.inputFile!, argv.outputDirectory);
    }

    let session: Session;
    session = tokenCache.Read() ?? await DoInteractiveLogin(videoUrls[0], argv.username);

    downloadVideo(videoUrls, outDirs, session);
}


main();
