import { ERROR_CODE } from './Errors';

import { execSync } from 'child_process';
import colors from 'colors';
import fs from 'fs';
import path from 'path';

function sanitizeUrls(urls: string[]) {
    // eslint-disable-next-line
    const rex = new RegExp(/(?:https:\/\/)?.*\/video\/[a-z0-9]{8}-(?:[a-z0-9]{4}\-){3}[a-z0-9]{12}$/, 'i');
    const sanitized: string[] = [];

    for (let i = 0, l = urls.length; i < l; ++i) {
        let url = urls[i].split('?')[0];

        if (!rex.test(url)) {
            if (url !== '') {
                console.warn(colors.yellow('Invalid URL at line ' + (i + 1) + ', skip..'));
            }

            continue;
        }

        if (url.substring(0, 8) !== 'https://') {
            url = 'https://' + url;
        }

        sanitized.push(url);
    }

    if (!sanitized.length) {
        process.exit(ERROR_CODE.INVALID_INPUT_URLS);
    }

    return sanitized;
}

function sanitizeOutDirsList(dirsList: string[]) {
    const sanitized: string[] = [];

    dirsList.forEach(dir => {
        if (dir !== '') {
            sanitized.push(dir);
        }
    });

    return sanitized;
}

function readFileToArray(path: string) {
    return fs.readFileSync(path).toString('utf-8').split(/[\r\n]/);
}

export async function forEachAsync(array: any, callback: any) {
    for (let i = 0, l = array.length; i < l; ++i) {
        await callback(array[i], i, array);
    }
}

export function parseVideoUrls(videoUrls: any) {
    let input = videoUrls[0] as string;
    const isPath = input.substring(input.length - 4) === '.txt';
    let urls: string[];

    if (isPath) {
        urls = readFileToArray(input);
    }
    else {
        urls = videoUrls as string[];
    }

    return sanitizeUrls(urls);
}

export function getOutputDirectoriesList(outDirArg: string) {
    const isList = outDirArg.substring(outDirArg.length - 4) === '.txt';
    let dirsList: string[];

    if (isList) {
        dirsList = sanitizeOutDirsList(readFileToArray(outDirArg));
    }
    else {
        dirsList = [outDirArg];
    }

    return dirsList;
}

export function makeOutputDirectories(dirsList: string[]) {
    dirsList.forEach(dir => {
        if (!fs.existsSync(dir)) {
            console.info(colors.yellow('Creating output directory:'));
            console.info(colors.green(dir) + '\n');

            try {
                fs.mkdirSync(dir, { recursive: true });
            }
            catch (e) {
                process.exit(ERROR_CODE.INVALID_OUTPUT_DIR);
            }
        }
    });
}

export function checkOutDirsUrlsMismatch(dirsList: string[], urlsList: string[]) {
    const dirsListL = dirsList.length;
    const urlsListL = urlsList.length;

    // single out dir, treat this as the chosen one for all
    if (dirsListL == 1) {
        return;
    }
    else if (dirsListL != urlsListL) {
        process.exit(ERROR_CODE.OUTDIRS_URLS_MISMATCH);
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function checkRequirements() {
    try {
        const ffmpegVer = execSync('ffmpeg -version').toString().split('\n')[0];
        console.info(colors.green(`Using ${ffmpegVer}\n`));

    }
    catch (e) {
        process.exit(ERROR_CODE.MISSING_FFMPEG);
    }
}

export function makeUniqueTitle(title: string, outDir: string, skip?: boolean, format?: string) {
    let ntitle = title;
    let k = 0;

    while (!skip && fs.existsSync(outDir + path.sep + ntitle + '.' + format)) {
        ntitle = title + ' - ' + (++k).toString();
    }

    return ntitle;
}

export function ffmpegTimemarkToChunk(timemark: string) {
    const timeVals: string[] = timemark.split(':');
    const hrs = parseInt(timeVals[0]);
    const mins = parseInt(timeVals[1]);
    const secs = parseInt(timeVals[2]);
    const chunk = (hrs * 60) + mins + (secs / 60);

    return chunk;
}
