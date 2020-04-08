import { sleep, getVideoUrls, checkRequirements } from './utils';
import { execSync } from 'child_process';
import isElevated from 'is-elevated';
import puppeteer from 'puppeteer';
import { terminal as term } from 'terminal-kit';
import fs from 'fs';
import os from 'os';
import path from 'path';
import yargs from 'yargs';
import sanitize from 'sanitize-filename';
import axios from 'axios';

/**
 * exitCode 22 = youtube-dl not found in $PATH
 * exitCode 23 = ffmpeg not found in $PATH
 * exitCode 25 = cannot split videoID from videUrl
 * exitCode 27 = no hlsUrl in the API response
 * exitCode 29 = invalid response from API
 * exitCode 88 = error extracting cookies
 */

const argv = yargs.options({
    username: { alias: "u", type: 'string', demandOption: false },
    outputDirectory: { type: 'string', alias: 'o', default: 'videos' },
    videoUrls: {
        alias: "V",
        describe: `List of video urls or path to txt file containing the urls`,
        type: 'array',
        demandOption: true
    },
    format: {
        alias:"f",
        describe: `Expose youtube-dl --format option, for details see\n
        https://github.com/ytdl-org/youtube-dl/blob/master/README.md#format-selection`,
        type:'string',
        demandOption: false
    },
    simulate: {
        alias: "s",
        describe: `If this is set to true no video will be downloaded and the script
        will log the video info (default: false)`,
        type: "boolean",
        default: false,
        demandOption: false
    },
    verbose: {
        alias: "v",
        describe: `Print additional information to the console
        (use this before opening an issue on GitHub)`,
        type: "boolean",
        default: false,
        demandOption: false
    }
}).argv;

function init() {
    // create output directory
    if (!fs.existsSync(argv.outputDirectory)){
        console.log('Creating output directory: ' +
            process.cwd() + path.sep + argv.outputDirectory);
        fs.mkdirSync(argv.outputDirectory);
    }

    console.info('Video URLs: %s', argv.videoUrls);
    console.info('Username: %s', argv.username);
    console.info('Output Directory: %s', argv.outputDirectory);

    if (argv.simulate)
        term.blue("There will be no video downloaded, it's only a simulation\n");

    if (argv.format)
        console.info('Video/Audio Quality: %s', argv.format);
}

async function rentVideoForLater(videoUrls: string[], outputDirectory: string, username?: string) {
    if (argv.verbose) {
        console.log('[VERBOSE] URL List:');
        console.log(videoUrls);
    }

    console.log('Launching headless Chrome to perform the OpenID Connect dance...');
    const browser = await puppeteer.launch({
        // Switch to false if you need to login interactively
        headless: false,
        args: ['--disable-dev-shm-usage']
    });
    const page = (await browser.pages())[0];
    console.log('Navigating to STS login page...');

    // This breaks on slow connections, needs more reliable logic
    await page.goto(videoUrls[0], { waitUntil: "networkidle2" });
    await page.waitForSelector('input[type="email"]');

    if (username) {
        await page.keyboard.type(username);
        await page.click('input[type="submit"]');
    }

    await browser.waitForTarget(target => target.url().includes('microsoftstream.com/'), { timeout: 90000 });
    console.log('We are logged in.');
    // We may or may not need to sleep here.
    // Who am i to deny a perfectly good nap?
    await sleep(1500);

    for (let videoUrl of videoUrls) {
        let videoID = videoUrl.split('/').pop() ??
            (console.error("Couldn't split the videoID, wrong url"), process.exit(25));

        // changed waitUntil value to load (page completly loaded)
        await page.goto(videoUrl, { waitUntil: 'load' });

        await sleep(2000);
        // try this instead of hardcoding sleep
        // https://github.com/GoogleChrome/puppeteer/issues/3649

        console.log("Page loaded")

        await sleep(4000);
        console.log("Calling Microsoft Stream API...");

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

        if (argv.verbose) {
            console.log(`\n\n[VERBOSE] ApiGatewayUri: ${session.ApiGatewayUri}\n
            ApiGatewayVersion: ${session.ApiGatewayVersion}\n\n`);
        }

        console.log(`ApiGatewayUri: ${session.ApiGatewayUri}`);
        console.log(`ApiGatewayVersion: ${session.ApiGatewayVersion}`);

        console.log("Fetching title and HLS URL...");
        var [title, date, hlsUrl] = await getVideoInfo(videoID, session);
        const sanitized = sanitize(title);

        title = (sanitized == "") ?
            `Video${videoUrls.indexOf(videoUrl)}` :
            sanitized;

        // Add date
        title += ' - '+date;

        // Add random index to prevent unwanted file overwrite!
        let k = 0;
        let ntitle = title;
        while (fs.existsSync(outputDirectory+"/"+ntitle+".mp4"))
            ntitle = title+' - '+(++k).toString();

        title = ntitle;

        term.blue("Video title is: ");
        console.log(`${title} \n`);

        console.log('Spawning youtube-dl with cookie and HLS URL...');

        const format = argv.format ? `-f "${argv.format}"` : "";

        var youtubedlCmd = 'youtube-dl --no-call-home --no-warnings ' + format +
                ` --output "${outputDirectory}/${title}.mp4" --add-header ` +
                `"Authorization: Bearer ${session.AccessToken}" "${hlsUrl}"`;

        if (argv.simulate) {
            youtubedlCmd = youtubedlCmd + " -s";
        }

        if (argv.verbose) {
            console.log(`\n\n[VERBOSE] Invoking youtube-dl:\n${youtubedlCmd}\n\n`);
        }
        execSync(youtubedlCmd, { stdio: 'inherit' });
    }

    console.log("At this point Chrome's job is done, shutting it down...");
    await browser.close();
}

async function getVideoInfo(videoID: string, session: any) {
    let title: string;
    let date: string;
    let hlsUrl: string;

    let content = axios.get(
        `${session.ApiGatewayUri}videos/${videoID}` +
        `?$expand=creator,tokens,status,liveEvent,extensions&api-version=${session.ApiGatewayVersion}`,
        {
            headers: {
                Authorization: `Bearer ${session.AccessToken}`
            }
        })
        .then(function (response) {
            return response.data;
        })
        .catch(function (error) {
            term.red('Error when calling Microsoft Stream API: ' +
                `${error.response.status} ${error.response.reason}`);
            console.error(error.response.status);
            console.error(error.response.data);
            console.error("Exiting...");
            if (argv.verbose) {
                term.red("[VERBOSE]");
                console.error(error)
            }
            process.exit(29);
        });

        title = await content.then(data => {
            return data["name"];
        });

        date = await content.then(data => {
            const dateJs = new Date(data["publishedDate"]);
            const day = dateJs.getDate().toString().padStart(2, '0');
            const month = (dateJs.getMonth() + 1).toString(10).padStart(2, '0');

            return day+'-'+month+'-'+dateJs.getFullYear();
        });

        hlsUrl = await content.then(data => {
            if (argv.verbose) {
                console.log(JSON.stringify(data, undefined, 2));
            }
            let playbackUrl = null;
            try {
                playbackUrl = data["playbackUrls"]
                    .filter((item: { [x: string]: string; }) =>
                        item["mimeType"] == "application/vnd.apple.mpegurl")
                    .map((item: { [x: string]: string }) =>
                        { return item["playbackUrl"]; })[0];
            }
            catch (e) {
                console.error(`Error fetching HLS URL: ${e}.\n playbackUrl is ${playbackUrl}`);
                process.exit(27);
            }

            return playbackUrl;
        });

    return [title, date, hlsUrl];
}

// FIXME
process.on('unhandledRejection', (reason, promise) => {
    term.red("Unhandled error!\nTimeout or fatal error, please check your downloads and try again if necessary.\n");
    term.red(reason);
    throw new Error("Killing process..\n");
});

async function main() {
    const isValidUser = !(await isElevated());
    let videoUrls: string[];

    if (!isValidUser) {
        const usrName = os.platform() === 'win32' ? 'Admin':'root';

        term.red('\nERROR: Destreamer does not run as '+usrName+'!\nPlease run destreamer with a non-privileged user.\n');
        process.exit(-1);
    }

    videoUrls = getVideoUrls(argv.videoUrls);
    if (videoUrls.length === 0) {
        term.red('\nERROR: No valid URL has been found!\n');
        process.exit(-1);
    }

    checkRequirements();
    init();
    rentVideoForLater(videoUrls, argv.outputDirectory, argv.username);
}

// run
main();
