import { CLI_ERROR, ERROR_CODE } from './Errors';
import { checkOutDir } from './Utils';
import { logger } from './Logger';
import { templateElements } from './Types';

import fs from 'fs';
import readlineSync from 'readline-sync';
import sanitize from 'sanitize-filename';
import yargs from 'yargs';


export const argv: any = yargs.options({
    username: {
        alias: 'u',
        type: 'string',
        describe: 'The username used to log into Microsoft Stream (enabling this will fill in the email field for you).',
        demandOption: false
    },
    videoUrls: {
        alias: 'i',
        describe: 'List of urls to videos or Microsoft Stream groups.',
        type: 'array',
        demandOption: false
    },
    inputFile: {
        alias: 'f',
        describe: 'Path to text file containing URLs and optionally outDirs. See the README for more on outDirs.',
        type: 'string',
        demandOption: false
    },
    outputDirectory: {
        alias: 'o',
        describe: 'The directory where destreamer will save your downloads.',
        type: 'string',
        default: 'videos',
        demandOption: false
    },
    outputTemplate: {
        alias: 't',
        describe: 'The template for the title. See the README for more info.',
        type: 'string',
        default: '{title} - {publishDate} {uniqueId}',
        demandOption: false
    },
    keepLoginCookies: {
        alias: 'k',
        describe: 'Let Chromium cache identity provider cookies so you can use "Remember me" during login.\n' +
                  'Must be used every subsequent time you launch Destreamer if you want to log in automatically.',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    noExperiments: {
        alias: 'x',
        describe: 'Do not attempt to render video thumbnails in the console.',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    simulate: {
        alias: 's',
        describe: 'Disable video download and print metadata information to the console.',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    verbose: {
        alias: 'v',
        describe: 'Print additional information to the console (use this before opening an issue on GitHub).',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    closedCaptions: {
        alias: 'cc',
        describe: 'Check if closed captions are available and let the user choose which one to download (will not ask if only one available).',
        type: 'boolean',
        default: false,
        demandOption: false
    },
    noCleanup: {
        alias: 'nc',
        describe: 'Do not delete the downloaded video file when an FFmpeg error occurs.',
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
        describe: 'Output container format (mkv, mp4, mov, anything that FFmpeg supports).',
        type: 'string',
        default: 'mkv',
        demandOption: false
    },
    skip: {
        describe: 'Skip download if file already exists.',
        type: 'boolean',
        default: false,
        demandOption: false
    }
})
.wrap(120)
.check(() => noArguments())
.check((argv: any) => checkInputConflicts(argv.videoUrls, argv.inputFile))
.check((argv: any) => {
    if (checkOutDir(argv.outputDirectory)) {
        return true;
    }
    else {
        logger.error(CLI_ERROR.INVALID_OUTDIR);

        throw new Error(' ');
    }
})
.check((argv: any) => isOutputTemplateValid(argv))
.argv;


function noArguments(): boolean {
    // if only 2 args no other args (0: node path, 1: js script path)
    if (process.argv.length === 2) {
        logger.error(CLI_ERROR.MISSING_INPUT_ARG, {fatal: true});

        // so that the output stays clear
        throw new Error(' ');
    }

    return true;
}


function checkInputConflicts(videoUrls: Array<string | number> | undefined,
    inputFile: string | undefined): boolean {
    // check if both inputs are declared
    if ((videoUrls !== undefined) && (inputFile !== undefined)) {
        logger.error(CLI_ERROR.INPUT_ARG_CONFLICT);

        throw new Error(' ');
    }
    // check if no input is declared or if they are declared but empty
    else if (!(videoUrls || inputFile) || (videoUrls?.length === 0) || (inputFile?.length === 0)) {
        logger.error(CLI_ERROR.MISSING_INPUT_ARG);

        throw new Error(' ');
    }
    else if (inputFile) {
        // check if inputFile doesn't end in '.txt'
        if (inputFile.substring(inputFile.length - 4) !== '.txt') {
            logger.error(CLI_ERROR.INPUTFILE_WRONG_EXTENSION);

            throw new Error(' ');
        }
        // check if the inputFile exists
        else if (!fs.existsSync(inputFile)) {
            logger.error(CLI_ERROR.INPUTFILE_NOT_FOUND);

            throw new Error(' ');
        }
    }

    return true;
}


function isOutputTemplateValid(argv: any): boolean {
    let finalTemplate: string = argv.outputTemplate;
    const elementRegEx = RegExp(/{(.*?)}/g);
    let match = elementRegEx.exec(finalTemplate);

    // if no template elements this fails
    if (match) {
        // keep iterating untill we find no more elements
        while (match) {
            if (!templateElements.includes(match[1])) {
                logger.error(
                    `'${match[0]}' is not available as a template element \n` +
                    `Available templates elements: '${templateElements.join("', '")}' \n`,
                    { fatal: true }
                );

                process.exit(1);
            }
            match = elementRegEx.exec(finalTemplate);
        }
    }
    // bad template from user, switching to default
    else {
        logger.warn('Empty output template provided, using default one \n');
        finalTemplate = '{title} - {publishDate} {uniqueId}';
    }

    argv.outputTemplate = sanitize(finalTemplate.trim());

    return true;
}


export function promptUser(choices: Array<string>): number {
    let index: number = readlineSync.keyInSelect(choices, 'Which resolution/format do you prefer?');

    if (index === -1) {
        process.exit(ERROR_CODE.CANCELLED_USER_INPUT);
    }

    return index;
}
