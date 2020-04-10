import { sleep, parseVideoUrls, checkRequirements, makeUniqueTitle } from './utils';
import { TokenCache } from './TokenCache';
import { getVideoMetadata } from './Metadata';
import { Metadata, Session } from './Types';
import { drawThumbnail } from './Thumbnail';

import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import colors from 'colors';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import sanitize from 'sanitize-filename';


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
        describe: `Disable video download and print metadata information to the console`,
        type: 'boolean',
        default: false,
        demandOption: false
    },
    noThumbnails: {
        alias: 'nthumb',
        describe: `Do not display video thumbnails`,
        type: 'boolean',
        default: false,
        demandOption: false
    },
    verbose: {
        alias: 'v',
        describe: `Print additional information to the console (use this before opening an issue on GitHub)`,
        type: 'boolean',
        default: false,
        demandOption: false
    }
}).argv;

async function init() {
    const isValidUser = !(await isElevated());

    if (!isValidUser) {
        const usrName = process.platform === 'win32' ? 'Admin':'root';

        console.error(colors.red(
            '\nERROR: Destreamer does not run as '+usrName+'!\nPlease run destreamer with a non-privileged user.\n'
        ));
        process.exit(-1);
    }

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

    let videoId = url.split("/").pop() ?? (
        console.log('Couldn\'t split the video Id from the first videoUrl'), process.exit(25)
        );

    console.log('Launching headless Chrome to perform the OpenID Connect dance...');
    const browser = await puppeteer.launch({
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
            process.exit(25);
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

    await Promise.all(metadata.map(async video => {
        console.log(colors.blue(`\nDownloading Video: ${video.title}\n`));

        video.title = makeUniqueTitle(sanitize(video.title) + ' - ' + video.date, argv.outputDirectory);

        // Very experimental inline thumbnail rendering
        if (!argv.noThumbnails)
            await drawThumbnail(video.posterImage, session.AccessToken);

        console.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...\n');

        const outputPath = outputDirectory + path.sep + video.title + '.mp4';
        
        // We probably need a way to be deterministic about
        // how we locate that ffmpeg-bar wrapper, npx maybe?
        // Do not remove those "useless" escapes or ffmpeg will
        // not pick up the header correctly.
        // eslint-disable-next-line no-useless-escape
        let cmd = `node_modules/.bin/ffmpeg-bar -headers "Authorization:\ Bearer\ ${session.AccessToken}" -i "${video.playbackUrl}" -y "${outputPath}"`;
        execSync(cmd, {stdio: 'inherit'});
        console.info(`Download finished: ${outputPath}`);
    }));
}

// FIXME
process.on('unhandledRejection', (reason) => {
    console.error(colors.red('Unhandled error!\nTimeout or fatal error, please check your downloads and try again if necessary.\n'));
    console.error(colors.red(reason as string));
    throw new Error('Killing process..\n');
});

async function main() {
    checkRequirements();
    await init();

    const videoUrls: string[] = parseVideoUrls(argv.videoUrls);

    if (videoUrls.length === 0) {
        console.error(colors.red('\nERROR: No valid URL has been found!\n'));
        process.exit(-1);
    }

    let session = tokenCache.Read();

    if (session == null) {
        session = await DoInteractiveLogin(videoUrls[0], argv.username);
    }

    downloadVideo(videoUrls, argv.outputDirectory, session);
}

// run
main();
