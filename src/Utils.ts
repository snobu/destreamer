import { ERROR_CODE } from './Errors';

import { execSync } from 'child_process';
import colors from 'colors';
import fs from 'fs';


export function sanitizeUrls(urls: Array<string>): Array<string> {

    const URLregex = new RegExp(/(https:\/\/.*\/video\/\w{8}-(?:\w{4}-){3}\w{12})/);
    const sanitized: Set<string> = new Set<string>();

    urls.forEach((url, index) =>{
        const match: RegExpExecArray | null = URLregex.exec(url);

        if (!match) {
            if (!(url === '' || url.startsWith(' '))) {
                console.warn(`Invalid URL at line ${index + 1}, skipping..`);
            }
        }
        else {
            // we add the first (and only) match from the regex
            sanitized.add(match[1]);
        }
    });

    if (!sanitized.size) {
        process.exit(ERROR_CODE.INVALID_INPUT_URLS);
    }

    return Array.from(sanitized);
}


export function parseInputFile(inputFile: string, defaultOutDir: string): Array<Array<string>> {

    // rawContent is a list of each line of the file that has content
    const rawContent: Array<string> = fs.readFileSync(inputFile).toString()
        .split(/\r?\n/); // .filter(item => item !== '');

    console.info('\nParsing and sanitizing URLs...\n');
    const urlList: Array<string> = sanitizeUrls(rawContent);
        // .filter(item => !item.startsWith(' ')));

    console.info('\nParsing and creating directories...\n');
    let outList: Array<string> = [];
    let i: number = 0;

    for (const url of urlList) {
        // this will let us sync urlList with rawContent
        while (!rawContent[i].includes(url)) {
            i++;
        }

        let outDir: string = parseOption('-dir', rawContent[i + 1]);

        if (outDir) {
            // check if the directory in the file is ok
            if (checkOutDir(outDir)) {
                outList.push(outDir);
            }
            // if not ok we fall back to default directory
            else {
                outList.push(defaultOutDir);
            }
        }
        else {
            outList.push(defaultOutDir);
        }
    }

    return [urlList, outList];
}


function parseOption(optionSyntax: string, item: string): string {
    const match = item.match(
        RegExp(`^\\s*${optionSyntax}\\s?=\\s?['"](.*)['"]`)
        );

    return match ? match[1] : '';
}


export function checkOutDir(directory: string): boolean {
    if (!fs.existsSync(directory)) {
        try {
            fs.mkdirSync(directory);
            console.log('Created directory: '.yellow + directory);
        }
        catch (e) {
            console.log('Cannot create directory: '.red + directory +
                '\nFalling back to default directory..');

            return false;
        }
    }

    return true;
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


export function ffmpegTimemarkToChunk(timemark: string): number {
    const timeVals: Array<string> = timemark.split(':');
    const hrs = parseInt(timeVals[0]);
    const mins = parseInt(timeVals[1]);
    const secs = parseInt(timeVals[2]);
    const chunk = (hrs * 60) + mins + (secs / 60);

    return chunk;
}
