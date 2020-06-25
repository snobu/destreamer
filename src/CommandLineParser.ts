import { CLI_ERROR, ERROR_CODE } from './Errors';
import { checkOutDir } from './Utils';

import colors from 'colors';
import readlineSync from 'readline-sync';
import yargs from 'yargs';
import fs from 'fs';


export const argv = yargs.options({
    username: {
        alias: 'u',
        type: 'string',
        describe: 'The username used to log into MS (enabling this will fill in the email field for you)',
        demandOption: false
    },
    videoUrls: {
        alias: 'i',
        describe: 'List of video urls',
        type: 'array',
        demandOption: false
    },
    inputFile: {
        alias: 'f',
        describe: 'Path to txt file containing the urls (and optionals outDirs)',
        type: 'string',
        demandOption: false
    },
    outputDirectory: {
        alias: 'o',
        describe: 'The directory where destreamer will save your downloads',
        type: 'string',
        default: 'videos',
        demandOption: false
    },
    keepLoginData: {
        alias: 'k',
        describe: 'Let chrome save cache data so that you can use the "remember me" option during login',
        type: 'boolean',
        demandOption: false
    },
    noExperiments: {
        alias: 'x',
        describe: 'Do not attempt to render video thumbnails in the console',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    simulate: {
        alias: 's',
        describe: 'Disable video download and print metadata information to the console',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    verbose: {
        alias: 'v',
        describe: 'Print additional information to the console (use this before opening an issue on GitHub)',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    closedCaptions: {
        alias: 'cc',
        describe: 'Check if closed captions are aviable and let the user choose which one to download (will not ask if only 1 aviable)',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    noCleanup: {
        alias: 'nc',
        describe: 'Do not delete the downloaded video file when an FFmpeg error occurs',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    vcodec: {
        describe: 'Re-encode video track. Specify FFmpeg codec (e.g. libx265) or set to "none" to disable video.',
        type: 'string',
        default: 'copy',
        demandOption: false
    },
    acodec: {
        describe: 'Re-encode audio track. Specify FFmpeg codec (e.g. libopus) or set to "none" to disable audio.',
        type: 'string',
        default: 'copy',
        demandOption: false
    },
    format: {
        describe: 'Output container format (mkv, mp4, mov, anything that FFmpeg supports)',
        type: 'string',
        default: 'mkv',
        demandOption: false
    },
    skip: {
        describe: 'Skip download if file already exists',
        type: 'boolean',
        default: false,
        demandOption: false
    }
})
.wrap(120)
.check(() => noArguments())
.check(argv => inputConflicts(argv.videoUrls, argv.inputFile))
.check(argv => {
    if (checkOutDir(argv.outputDirectory)) {
        return true;
    }
    else {
        throw new Error(makeFatalError(CLI_ERROR.INVALID_OUTDIR));
    }
})
.argv;


function noArguments(): boolean {
    // if only 2 args no other args (0: node path, 1: js script path)
    if (process.argv.length === 2) {
        throw new Error(makeFatalError(CLI_ERROR.MISSING_INPUT_ARG));
    }

    return true;
}


function inputConflicts(videoUrls: Array<string | number> | undefined,
    inputFile: string | undefined): boolean {
    // check if both inputs are declared
    if ((videoUrls !== undefined) && (inputFile !== undefined)) {
        throw new Error(makeFatalError(CLI_ERROR.INPUT_ARG_CONFLICT));
    }
    // check if no input is declared or if they are declared but empty
    else if (!(videoUrls || inputFile) || (videoUrls?.length === 0) || (inputFile?.length === 0)) {
        throw new Error(makeFatalError(CLI_ERROR.MISSING_INPUT_ARG));
    }
    else if (inputFile) {
        // check if inputFile doesn't end in '.txt'
        if (inputFile.substring(inputFile.length - 4) !== '.txt') {
            throw new Error(makeFatalError(CLI_ERROR.INPUTFILE_WRONG_EXTENSION));
        }
        // check if the inputFile exists
        else if (!fs.existsSync(inputFile)) {
            throw new Error(makeFatalError(CLI_ERROR.INPUTFILE_DOESNT_EXISTS));
        }
    }

    return true;
}


function makeFatalError(message: string): string {
    return colors.red('\n[FATAL ERROR] ') + message;
}


export function askUserChoiche(choiches: Array<string>): number {
    let index = readlineSync.keyInSelect(choiches, 'Which resolution/format do you prefer?');

    if (index === -1) {
        process.exit(ERROR_CODE.CANCELLED_USER_INPUT);
    }

    return index;
}
