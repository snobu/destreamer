import { logger } from './Logger';
import { checkRequirements, ffmpegTimemarkToChunk, parseInputFile, parseCLIinput} from './Utils';
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
import fs from 'fs';
import cliProgress from 'cli-progress';


const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();
const tokenCache = new TokenCache();


async function init() {
    setProcessEvents(); // must be first!

    if (argv.verbose) {
        logger.level = 'verbose';
    }

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
    const videoId = url.split('/').pop() ?? process.exit(ERROR_CODE.INVALID_VIDEO_ID);

    logger.info('Launching headless Chrome to perform the OpenID Connect dance...');

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

    await browser.waitForTarget(target => target.url().includes(videoId), { timeout: 150000 });
    logger.info('We are logged in.');

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
    logger.info('Wrote access token to token cache.');
    logger.info("At this point Chromium's job is done, shutting it down...\n");

    await browser.close();

    return session;
}


async function downloadVideo(videoGUIDs: Array<string>, outputDirectories: Array<string>, session: Session) {

    logger.info('Fetching videos info... \n');
    const videos: Array<Video> = createUniquePath (
        await getVideoInfo(videoGUIDs, session, argv.closedCaptions),
        outputDirectories, argv.format, argv.skip
        );

    if (argv.simulate) {
        videos.forEach(video => {
            logger.info(
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
            logger.info(`File already exists, skipping: ${video.outPath} \n`);
            continue;
        }

        if (argv.keepLoginData) {
            logger.info('Trying to refresh token...');
            session = await refreshSession();
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

        logger.info(`\nDownloading Video: ${video.title} \n`);
        logger.verbose('Extra video info \n' +
        '\t Video m3u8 playlist URL: '.cyan + video.playbackUrl + '\n' +
        '\t Video tumbnail URL: '.cyan + video.posterImageUrl + '\n' +
        '\t Video subtitle URL (may not exist): '.cyan + video.captionsUrl + '\n' +
        '\t Video total chunks: '.cyan + video.totalChunks + '\n');

        logger.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...');
        if (!process.stdout.columns) {
            logger.warn(
                'Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            );
        }

        const headers = 'Authorization: Bearer ' + session.AccessToken;

        if (!argv.noExperiments) {
            await drawThumbnail(video.posterImageUrl, session);
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
}


async function main() {
    await init(); // must be first

    let session: Session;
    session = tokenCache.Read() ?? await DoInteractiveLogin('https://web.microsoftstream.com/', argv.username);

    logger.verbose('Session and API info \n' +
        '\t API Gateway URL: '.cyan + session.ApiGatewayUri + '\n' +
        '\t API Gateway version: '.cyan + session.ApiGatewayVersion + '\n');

    let videoGUIDs: Array<string>;
    let outDirs: Array<string>;

    if (argv.videoUrls) {

        [videoGUIDs, outDirs] =  await parseCLIinput(argv.videoUrls as Array<string>, argv.outputDirectory, session);
    }
    else {
        [videoGUIDs, outDirs] =  await parseInputFile(argv.inputFile!, argv.outputDirectory, session);

    }

    logger.verbose('List of videos and corresponding output directory \n' +
        videoGUIDs.map((guid, i) => `\t${guid} => ${outDirs[i]} \n`).join(''));

    process.exit();
    downloadVideo(videoGUIDs, outDirs, session);
}


main();
