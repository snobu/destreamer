import { CLI_ERROR } from './Errors';

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
.check((argv) => inputConflicts(argv))
.argv;


function noArguments(): boolean {
    // if only 2 args no other args (0: node path, 1: js script path)
    if (process.argv.length === 2) {
        throw new Error(CLI_ERROR.MISSING_INPUT_ARG.red);
    }

    return true;
}


function inputConflicts(argv: any): boolean {
    // check if both inputs are declared
    if ((argv.videoUrls !== undefined) && (argv.inputFile !== undefined)) {
        throw new Error(CLI_ERROR.INPUT_ARG_CONFLICT.red);
    }
    // check if no input is declared or if they are declared but empty
    else if (!(argv.videoUrls || argv.inputFile) || (argv.videoUrls?.length === 0) || (argv.inputFile?.length === 0)) {
        throw new Error(CLI_ERROR.MISSING_INPUT_ARG.red);
    }
    else if (argv.inputFile) {
        // check if inputFile doesn't end in '.txt'
        if (argv.inputFile.substring(argv.inputFile.length - 4) !== '.txt') {
            throw new Error(CLI_ERROR.INPUTFILE_WRONG_EXTENSION.red);
        }
        // check if the inputFile exists
        else if (!fs.existsSync(argv.inputFile)) {
            throw new Error(CLI_ERROR.INPUTFILE_DOESNT_EXISTS.red);
        }
    }

    return true;
}
