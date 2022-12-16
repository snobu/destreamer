import { StreamApiClient } from './ApiClient';
import { ERROR_CODE } from './Errors';
import { logger } from './Logger';
import { StreamSession, VideoUrl } from './Types';

import { AxiosResponse } from 'axios';
import { execSync } from 'child_process';
import fs from 'fs';
import readlineSync from 'readline-sync';


const streamUrlRegex = new RegExp(/https?:\/\/web\.microsoftstream\.com.*/);
const shareUrlRegex = new RegExp(/https?:\/\/.+\.sharepoint\.com.*/);


/** we place the guid in the url fild in the return */
export async function extractStreamGuids(urlList: Array<VideoUrl>, session: StreamSession): Promise<Array<VideoUrl>> {
    const videoRegex = new RegExp(/https:\/\/.*\/video\/(\w{8}-(?:\w{4}-){3}\w{12})/);
    const groupRegex = new RegExp(/https:\/\/.*\/group\/(\w{8}-(?:\w{4}-){3}\w{12})/);

    const apiClient: StreamApiClient = StreamApiClient.getInstance(session);
    const guidList: Array<VideoUrl> = [];

    for (const url of urlList) {
        const videoMatch: RegExpExecArray | null = videoRegex.exec(url.url);
        const groupMatch: RegExpExecArray | null = groupRegex.exec(url.url);

        if (videoMatch) {
            guidList.push({
                url: videoMatch[1],
                outDir: url.outDir
            });
        }
        else if (groupMatch) {
            const videoNumber: number = await apiClient.callApi(`groups/${groupMatch[1]}`, 'get')
                .then((response: AxiosResponse<any> | undefined) => response?.data.metrics.videos);

            // Anything above $top=100 results in 400 Bad Request
            // Use $skip to skip the first 100 and get another 100 and so on
            for (let index = 0; index <= Math.floor(videoNumber / 100); index++) {
                await apiClient.callApi(
                    `groups/${groupMatch[1]}/videos?$skip=${100 * index}&` +
                    '$top=100&$orderby=publishedDate asc', 'get'
                ).then((response: AxiosResponse<any> | undefined) => {
                    response?.data.value.forEach((video: { id: string }) =>
                        guidList.push({
                            url: video.id,
                            outDir: url.outDir
                        })
                    );
                });
            }
        }
        else {
            logger.warn(`Invalid url '${url.url}', skipping...`);
        }
    }

    return guidList;
}


/**
 * Parse the list of url given by the user via console input.
 * They can either be video urls or group urls, in which case the guids
 * will be added from oldest to newest.
 *
 * @param {Array<string>} urlList       list of link to parse
 * @param {string}        defaultOutDir the directry used to save the videos
 *
 * @returns Array of 2 elements: 1st an array of Microsoft Stream urls, 2nd an array of SharePoint urls
 */
export function parseCLIinput(urlList: Array<string>, defaultOutDir: string): Array<Array<VideoUrl>> {
    const stream: Array<VideoUrl> = [];
    const share: Array<VideoUrl> = [];

    for (const url of urlList) {
        if (streamUrlRegex.test(url)) {
            stream.push({
                url: url,
                outDir: defaultOutDir
            });
        }
        else if (shareUrlRegex.test(url)) {
            share.push({
                url: url,
                outDir: defaultOutDir
            });
        }
        else {
            logger.warn(`Invalid url '${url}', skipping..`);
        }
    }

    return [stream, share];
}


/**
 * Parse the input text file.
 * The urls in the file can either be video urls or group urls, in which case the guids
 * will be added from oldest to newest.
 *
 * @param {string}  inputFile     path to the text file
 * @param {string}  defaultOutDir the default/fallback directory used to save the videos
 *
 * @returns Array of 2 elements, 1st one being the GUIDs array, 2nd one the output directories array
 */
export function parseInputFile(inputFile: string, defaultOutDir: string): Array<Array<VideoUrl>> {
    // rawContent is a list of each line of the file
    const rawContent: Array<string> = fs.readFileSync(inputFile).toString().split(/\r?\n/);
    const stream: Array<VideoUrl> = [];
    const share: Array<VideoUrl> = [];
    let streamUrl = false;

    for (let i = 0; i < rawContent.length; i++) {
        const line: string = rawContent[i];
        const nextLine: string | null = i < rawContent.length ? rawContent[i + 1] : null;
        let outDir = defaultOutDir;

        // filter out lines with no content
        if (!line.match(/\S/)) {
            logger.warn(`Line ${i + 1} is empty, skipping..`);
            continue;
        }
        // check for urls
        else if (streamUrlRegex.test(line)) {
            streamUrl = true;
        }
        else if (shareUrlRegex.test(line)) {
            streamUrl = false;
        }
        // now invalid line since we skip ahead one line if we find dir option
        else {
            logger.warn(`Line ${i + 1}: '${line}' is invalid, skipping..`);

            continue;
        }

        // we now have a valid url, check next line for option
        if (nextLine) {
            const optionDir = parseOption('-dir', nextLine);

            if (optionDir && makeOutDir(optionDir)) {
                outDir = optionDir;
                // if there was an option we skip a line
                i++;
            }
        }

        if (streamUrl) {
            stream.push({
                url: line,
                outDir
            });
        }
        else {
            share.push({
                url: line,
                outDir
            });
        }
    }


    return [stream, share];
}


// This leaves us the option to add more options (badum tss) _Luca
function parseOption(optionSyntax: string, item: string): string | null {
    const match: RegExpMatchArray | null = item.match(
        RegExp(`^\\s+${optionSyntax}\\s*=\\s*['"](.*)['"]`)
    );

    return match ? match[1] : null;
}

/**
 * @param directory path to create
 * @returns true on success, false otherwise
 */
export function makeOutDir(directory: string): boolean {
    if (!fs.existsSync(directory)) {
        try {
            fs.mkdirSync(directory);
            logger.info('\nCreated directory: '.yellow + directory);
        }
        catch (e) {
            logger.warn('Cannot create directory: ' + directory +
                '\nFalling back to default directory..');

            return false;
        }
    }

    return true;
}


export function checkRequirements(): void {
    try {
        const copyrightYearRe = new RegExp(/\d{4}-(\d{4})/);
        const ffmpegVer: string = execSync('ffmpeg -version').toString().split('\n')[0];

        if (parseInt(copyrightYearRe.exec(ffmpegVer)?.[1] ?? '0') <= 2019) {
            process.exit(ERROR_CODE.OUTDATED_FFMPEG);
        }

        logger.verbose(`Using ${ffmpegVer}\n`);
    }
    catch (e) {
        process.exit(ERROR_CODE.MISSING_FFMPEG);
    }

    try {
        const versionRegex = new RegExp(/aria2 .* (\d+\.\d+\.\d+.*)/);
        const aira2Ver: string = execSync('aria2c --version').toString().split('\n')[0];

        if (versionRegex.test(aira2Ver)) {
            logger.verbose(`Using ${aira2Ver}\n`);
        }
        else {
            throw new Error();
        }
    }
    catch (e) {
        process.exit(ERROR_CODE.MISSING_ARIA2);
    }
}

// number of seconds
export function ffmpegTimemarkToChunk(timemark: string): number {
    const timeVals: Array<string> = timemark.split(':');
    const hrs: number = parseInt(timeVals[0]);
    const mins: number = parseInt(timeVals[1]);
    const secs: number = parseInt(timeVals[2]);

    return (hrs * 60 * 60) + (mins * 60) + secs;
}


export function promptUser(choices: Array<string>): number {
    const index: number = readlineSync.keyInSelect(choices, 'Which resolution/format do you prefer?');

    if (index === -1) {
        process.exit(ERROR_CODE.CANCELLED_USER_INPUT);
    }

    return index;
}
