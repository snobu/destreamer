import { sleep, parseVideoUrls, checkRequirements, makeUniqueTitle, ffmpegTimemarkToChunk } from './utils';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { setProcessEvents } from './Events';
import { TokenCache } from './TokenCache';
import { getVideoMetadata } from './Metadata';
import { Metadata, Session } from './Types';
import { drawThumbnail } from './Thumbnail';
import { argv } from './CommandLineParser';

import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import colors from 'colors';
import fs from 'fs';
import path from 'path';
import sanitize from 'sanitize-filename';
import cliProgress from 'cli-progress';

const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();
let tokenCache = new TokenCache();

async function init() {
    setProcessEvents(); // must be first!

    if (await isElevated())
        process.exit(55);

    checkRequirements();

    // create output directory
    if (!fs.existsSync(argv.outputDirectory)) {
        console.log('Creating output directory: ' +
            process.cwd() + path.sep + argv.outputDirectory);
        fs.mkdirSync(argv.outputDirectory);
    }

    console.info('Output Directory: %s', argv.outputDirectory);

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
    const videoId = url.split("/").pop() ?? process.exit(33)

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
    let tries: number = 0;

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
            if (tries < 5){
                session = null;
                tries++;
                await sleep(3000);
            } else {
                process.exit(44)
            }
        }
    }

    tokenCache.Write(session);
    console.log('Wrote access token to token cache.');
    console.log("At this point Chromium's job is done, shutting it down...\n");

    await browser.close();

    return session;
}

function extractVideoGuid(videoUrls: string[]): string[] {
    let videoGuids: string[] = [];
    let guid: string | undefined = '';

    for (const url of videoUrls) {
        try {
            guid = url.split('/').pop();

        } catch (e) {
            console.error(`Could not split the video GUID from URL: ${e.message}`);
            process.exit(33);
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

async function downloadVideo(videoUrls: string[], outputDirectory: string, session: Session) {
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

    for (let i=0, l=metadata.length; i<l; ++i) {
        const video = metadata[i];
        let previousChunks = 0;
        const pbar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}% {speed} {eta_formatted}',
            barsize: Math.floor(process.stdout.columns / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        console.log(colors.yellow(`\nDownloading Video: ${video.title}\n`));

        video.title = makeUniqueTitle(sanitize(video.title) + ' - ' + video.date, argv.outputDirectory);

        // Very experimental inline thumbnail rendering
        if (!argv.noThumbnails)
            await drawThumbnail(video.posterImage, session.AccessToken);

        console.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...\n');

        const outputPath = outputDirectory + path.sep + video.title + '.mp4';
        const ffmpegInpt = new FFmpegInput(video.playbackUrl, new Map([
            ['headers', `Authorization:\ Bearer\ ${session.AccessToken}`]
        ]));
        const ffmpegOutput = new FFmpegOutput(outputPath);
        const ffmpegCmd = new FFmpegCommand();

        pbar.start(video.totalChunks, 0, {
            speed: '0'
        });

        // prepare ffmpeg command line
        ffmpegCmd.addInput(ffmpegInpt);
        ffmpegCmd.addOutput(ffmpegOutput);

        // set events
        ffmpegCmd.on('update', (data: any) => {
            const currentChunks = ffmpegTimemarkToChunk(data.out_time);
            const incChunk = currentChunks - previousChunks;

            pbar.increment(incChunk, {
                speed: data.bitrate
            });

            previousChunks = currentChunks;
        });

        ffmpegCmd.on('error', (error: any) => {
            pbar.stop();
            console.log(`\nffmpeg returned an error: ${error.message}`);
            process.exit(34);
        });

        process.on('SIGINT', () => {
            pbar.stop();
        });

        // let the magic begin...
        await new Promise((resolve: any, reject: any) => {
            ffmpegCmd.on('success', (data:any) => {
                pbar.update(video.totalChunks); // set progress bar to 100%
                console.log(colors.green(`\nDownload finished: ${outputPath}`));
                resolve();
            });

            ffmpegCmd.spawn();
        });
    }
}

async function main() {
    await init();

    const videoUrls: string[] = parseVideoUrls(argv.videoUrls) ?? process.exit(66);
    let session = tokenCache.Read();

    if (session == null) {
        session = await DoInteractiveLogin(videoUrls[0], argv.username);
    }

    downloadVideo(videoUrls, argv.outputDirectory, session);
}


main();
