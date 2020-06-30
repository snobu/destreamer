import { ERROR_CODE } from './Errors';
import { logger } from './Logger';
import { Session } from './Types';
import { ApiClient } from './ApiClient';

import { execSync } from 'child_process';
import fs from 'fs';



async function extractGUIDs(url: string, client: ApiClient): Promise<Array<string> | null> {

    const videoRegex = new RegExp(/https:\/\/.*\/video\/(\w{8}-(?:\w{4}-){3}\w{12})/);
    const groupRegex = new RegExp(/https:\/\/.*\/group\/(\w{8}-(?:\w{4}-){3}\w{12})/);

    const videoMatch = videoRegex.exec(url);
    const groupMatch = groupRegex.exec(url);

    if (videoMatch) {
        return [videoMatch[1]];
    }
    else if (groupMatch) {
        const videoNumber = await client.callApi(`groups/${groupMatch[1]}`, 'get')
            .then(response => response?.data.metrics.videos);

        return await client.callApi(`groups/${groupMatch[1]}/videos?$top=${videoNumber}&$orderby=publishedDate asc`, 'get')
            .then(response => response?.data.value.map((item: any) => item.id) );
    }

    return null;
}

/**
 * Parse the list of url given by the user via console input.
 * They can either be video urls or group urls, in which case the guids
 * will be added from oldest to newest.
 *
 * @param {Array<string>} urlList       list of link to parse
 * @param {string}        defaultOutDir the directry used to save the videos
 * @param {Session}       session       used to call the API to get the GUIDs from group links
 *
 * @returns Array of 2 elements, 1st one being the GUIDs array, 2nd one the output directories array
 */
export async function parseCLIinput(urlList: Array<string>, defaultOutDir: string,
    session: Session): Promise<Array<Array<string>>> {

    const apiClient = ApiClient.getInstance(session);
    let guidList: Array<string> = [];

    for (const url of urlList) {
        const guids: Array<string> | null = await extractGUIDs(url, apiClient);

        if (guids) {
            guidList.push(...guids);
        }
        else {
            logger.warn(`Invalid url '${url}', skipping..`);
        }
    }

    const outDirList: Array<string> = Array(guidList.length).fill(defaultOutDir);

    return [guidList, outDirList];
}

/**
 * Parse the input text file.
 * The urls in the file can either be video urls or group urls, in which case the guids
 * will be added from oldest to newest.
 *
 * @param {string}  inputFile     path to the text file
 * @param {string}  defaultOutDir the default/fallback directory used to save the videos
 * @param {Session} session       used to call the API to get the GUIDs from group links
 *
 * @returns Array of 2 elements, 1st one being the GUIDs array, 2nd one the output directories array
 */
export async function parseInputFile(inputFile: string, defaultOutDir: string,
    session: Session): Promise<Array<Array<string>>> {
    // rawContent is a list of each line of the file
    const rawContent: Array<string> = fs.readFileSync(inputFile).toString()
        .split(/\r?\n/);
    const apiClient = ApiClient.getInstance(session);

    let guidList: Array<string> = [];
    let outDirList: Array<string> = [];
    // if the last line was an url set this
    let foundUrl: boolean = false;

    for (let i = 0; i < rawContent.length; i++) {
        const line = rawContent[i];

        // filter out lines with no content
        if (!line.match(/\S/)) {
            logger.warn(`Line ${i + 1} is empty, skipping..`);
            continue;
        }
        // parse if line is option
        else if (line.includes('-dir')) {
            if (foundUrl) {
                let outDir: string | null = parseOption('-dir', line);

                if (outDir && checkOutDir(outDir)) {
                    outDirList.push(...Array(guidList.length - outDirList.length)
                    .fill(outDir));
                }
                else {
                    outDirList.push(...Array(guidList.length - outDirList.length)
                    .fill(defaultOutDir));
                }

                foundUrl = false;
                continue;
            }
            else {
            logger.warn(`Found options without preceding url at line ${i + 1}, skipping..`);
            continue;
            }
        }

        /* now line is not empty nor an option line.
        If foundUrl is still true last line didn't have a directory option
        so we stil need to add the default outDir to outDirList to  */
        if (foundUrl) {
            outDirList.push(...Array(guidList.length - outDirList.length)
                .fill(defaultOutDir));
        }

        const guids: Array<string> | null = await extractGUIDs(line, apiClient);

        if (guids) {
            guidList.push(...guids);
            foundUrl = true;
        }
        else {
            logger.warn(`Invalid url at line ${i + 1}, skipping..`);
        }
    }

    return [guidList, outDirList];
}


function parseOption(optionSyntax: string, item: string): string | null {
    const match = item.match(
        RegExp(`^\\s*${optionSyntax}\\s?=\\s?['"](.*)['"]`)
        );

    return match ? match[1] : null;
}


export function checkOutDir(directory: string): boolean {
    if (!fs.existsSync(directory)) {
        try {
            fs.mkdirSync(directory);
            logger.info('Created directory: '.yellow + directory);
        }
        catch (e) {
            logger.warn('Cannot create directory: '+ directory +
                '\nFalling back to default directory..');

            return false;
        }
    }

    return true;
}


export function checkRequirements() {
    try {
        const ffmpegVer = execSync('ffmpeg -version').toString().split('\n')[0];
        logger.info(`Using ${ffmpegVer}\n`);
    }
    catch (e) {
        process.exit(ERROR_CODE.MISSING_FFMPEG);
    }
}


export function ffmpegTimemarkToChunk(timemark: string): number {
    const timeVals: Array<string> = timemark.split(':');
    const hrs = parseInt(timeVals[0]);
    const mins = parseInt(timeVals[1]);
    const secs = parseInt(timeVals[2]);

    return (hrs * 60) + mins + (secs / 60);
}
