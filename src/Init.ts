import { execSync } from 'child_process';
import { Errors } from './Types';

import colors from 'colors'
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';


export function checkRequirements() {
    try {
        return execSync('ffmpeg -version',
        { stdio: ['pipe','pipe','ignore'] }).toString().split('\n')[0];
    } catch (e) {
        return null;
    }
}

// TODO: implement check for absolute path for correct console logging
export function createVideoDir(directory: string) {
    if (!fs.existsSync(directory)) {
        console.log('Creating output directory: ' +
            process.cwd() + path.sep + directory);
        fs.mkdirSync(directory);
    }
}


export function handleSetup() {
    process.on('unhandledRejection', (reason) => {
        console.error(colors.red('Unhandled error!\nTimeout or fatal error, please check your downloads and try again if necessary.\n'));
        console.error(colors.red(reason as string));
    });

    process.on('exit', (code) => {
        if (code == 0) {
            return
        };
        if (code in Errors)
            console.error(colors.bgRed(`\nError: ${Errors[code]}\n`))
        else
            console.error(colors.bgRed(`\nUnknown exit code ${code}\n`))
    });
}


export function parseArgs() {
    return yargs.options({
        videoUrls: {
            alias: 'V',
            describe: 'List of video urls or path to txt file containing the urls',
            type: 'array',
            demandOption: true
        },
        noThumbnails: {
            alias: 'nthumb',
            describe: `Do not display video thumbnails`,
            type: 'boolean',
            default: false,
            demandOption: false
        },
        outputDirectory: {
            alias: 'o',
            type: 'string',
            default: 'videos',
            demandOption: false
        },
        simulate: {
            alias: 's',
            describe: `Disable video download and print metadata information to the console`,
            type: 'boolean',
            default: false,
            demandOption: false
        },
        username: {
            alias: 'u',
            type: 'string',
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
}
