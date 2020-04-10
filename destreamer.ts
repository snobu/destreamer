import { sleep, getVideoUrls, checkRequirements } from './utils';
import { TokenCache } from './TokenCache';
import { getVideoMetadata } from './Metadata';
import { Metadata, Session } from './Types';
import { drawThumbnail } from './Thumbnail';

import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import colors from 'colors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yargs from 'yargs';
import sanitize from 'sanitize-filename';
import ffmpeg from 'fluent-ffmpeg';

/**
 * exitCode 22 = ffmpeg not found in $PATH
 * exitCode 25 = cannot split videoID from videUrl
 * exitCode 27 = no hlsUrl in the API response
 * exitCode 29 = invalid response from API
 * exitCode 88 = error extracting cookies
 */

let tokenCache = new TokenCache();

const argv = yargs.options({
    username: {
        alias: 'u',
        type: 'string',
        demandOption: false
    },
    outputDirectory: {
        alias: 'o',
        type: 'string',
        default: 'videos',
        demandOption: false
    },
    videoUrls: {
        alias: 'V',
        describe: 'List of video urls or path to txt file containing the urls',
        type: 'array',
        demandOption: true
    },
    simulate: {
        alias: 's',
        describe: `If this is set to true no video will be downloaded and the script
        will log the video info (default: false)`,
        type: 'boolean',
        default: false,
        demandOption: false
    },
    verbose: {
        alias: 'v',
        describe: `Print additional information to the console
        (use this before opening an issue on GitHub)`,
        type: 'boolean',
        default: false,
        demandOption: false
    }
}).argv;

function init() {
    // create output directory
    if (!fs.existsSync(argv.outputDirectory)) {
        console.log('Creating output directory: ' +
            process.cwd() + path.sep + argv.outputDirectory);
        fs.mkdirSync(argv.outputDirectory);
    }

    console.info('Video URLs: %s', argv.videoUrls);
    console.info('Username: %s', argv.username);
    console.info('Output Directory: %s', argv.outputDirectory);

    if (argv.simulate)
        console.info(colors.blue("There will be no video downloaded, it's only a simulation\n"));
}

async function DoInteractiveLogin(username?: string): Promise<Session> {
    console.log('Launching headless Chrome to perform the OpenID Connect dance...');
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--disable-dev-shm-usage']
    });
    const page = (await browser.pages())[0];
    console.log('Navigating to microsoftonline.com login page...');

    // This breaks on slow connections, needs more reliable logic
    await page.goto('https://web.microsoftstream.com', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="email"]');

    if (username) {
        await page.keyboard.type(username);
        await page.click('input[type="submit"]');
    }

    await browser.waitForTarget(target => target.url().includes('microsoftstream.com/'), { timeout: 90000 });
    console.info('We are logged in.');
    // We may or may not need to sleep here.
    // Who am i to deny a perfectly good nap?
    await sleep(1500);

    console.info('Got cookie. Consuming cookie...');

    await sleep(4000);
    console.info('Calling Microsoft Stream API...');

    let sessionInfo: any;
    let session = await page.evaluate(
        () => {
            return {
                AccessToken: sessionInfo.AccessToken,
                ApiGatewayUri: sessionInfo.ApiGatewayUri,
                ApiGatewayVersion: sessionInfo.ApiGatewayVersion
            };
        }
    );

    tokenCache.Write(session);
    console.info('Wrote access token to token cache.');

    console.log(`ApiGatewayUri: ${session.ApiGatewayUri}`);
    console.log(`ApiGatewayVersion: ${session.ApiGatewayVersion}`);

    console.info("At this point Chromium's job is done, shutting it down...");
    await browser.close();

    return session;
}

function extractVideoGuid(videoUrls: string[]): string[] {
    const first = videoUrls[0] as string;
    const isPath = first.substring(first.length - 4) === '.txt';
    let urls: string[];

    if (isPath)
        urls = fs.readFileSync(first).toString('utf-8').split(/[\r\n]/);
    else
        urls = videoUrls as string[];
    let videoGuids: string[] = [];
    let guid: string | undefined = '';
    for (let url of urls) {
        console.log(url);
        try {
            guid = url.split('/').pop();

        } catch (e) {
            console.error(`Could not split the video GUID from URL: ${e.message}`);
            process.exit(25);
        }
        if (guid) {
            videoGuids.push(guid);
        }
    }

    console.log(videoGuids);
    return videoGuids;
}

async function downloadVideo(videoUrls: string[], outputDirectory: string, session: Session) {
    console.log(videoUrls);
    const videoGuids = extractVideoGuid(videoUrls);

    console.log('Fetching title and HLS URL...');
    let metadata: Metadata[] = await getVideoMetadata(videoGuids, session);
    await Promise.all(metadata.map(async video => {
        video.title = sanitize(video.title);
        console.log(colors.blue(`\nDownloading Video: ${video.title}\n`));

        // Very experimental inline thumbnail rendering
        await drawThumbnail(video.posterImage, session.AccessToken);

        console.info('Spawning ffmpeg with access token and HLS URL...');

        const outputPath = outputDirectory + path.sep + video.title + '.mp4';

        ffmpeg()
            .input(video.playbackUrl)
            .inputOption([
                // Never remove those "useless" escapes or ffmpeg will not
                // pick up the header correctly
                // eslint-disable-next-line no-useless-escape
                '-headers', `Authorization:\ Bearer\ ${session.AccessToken}`
                ])
                    .format('mp4')
                    .saveToFile(outputPath)
                    .on('codecData', data => {
                    console.log(`Input is ${data.video} with ${data.audio} audio.`);
                })
                    .on('progress', progress => {
                    console.log(progress);
                })
                    .on('error', err => {
                    console.log(`ffmpeg returned an error: ${err.message}`);
                })
                    .on('end', () => {
                    console.log(`Download finished: ${outputPath}`);
                });
    }));
}

// FIXME
process.on('unhandledRejection', (reason) => {
    console.error(colors.red('Unhandled error!\nTimeout or fatal error, please check your downloads and try again if necessary.\n'));
    console.error(colors.red(reason as string));
    throw new Error('Killing process..\n');
});

async function main() {
    const isValidUser = !(await isElevated());
    let videoUrls: string[];

    if (!isValidUser) {
        const usrName = os.platform() === 'win32' ? 'Admin':'root';

        console.error(colors.red('\nERROR: Destreamer does not run as '+usrName+'!\nPlease run destreamer with a non-privileged user.\n'));
        process.exit(-1);
    }

    videoUrls = getVideoUrls(argv.videoUrls);
    if (videoUrls.length === 0) {
        console.error(colors.red('\nERROR: No valid URL has been found!\n'));
        process.exit(-1);
    }

    checkRequirements();

    let session = tokenCache.Read();
    if (session == null) {
        session = await DoInteractiveLogin(argv.username);
    }


    init();
    downloadVideo(videoUrls, argv.outputDirectory, session);
}

// run
main();
