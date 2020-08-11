import { CLI_ERROR } from './Errors';

import yargs from 'yargs';
import colors from 'colors';
import fs from 'fs';

export const argv = yargs.options({
    videoUrls: {
        alias: 'i',
        describe: 'List of video urls',
        type: 'array',
        demandOption: false
    },
    videoUrlsFile: {
        alias: 'f',
        describe: 'Path to txt file containing the urls',
        type: 'string',
        demandOption: false
    },
    username: {
        alias: 'u',
        type: 'string',
        demandOption: false
    },
    outputDirectory: {
        alias: 'o',
        describe: 'The directory where destreamer will save your downloads [default: videos]',
        type: 'string',
        demandOption: false
    },
    outputDirectories: {
        alias: 'O',
        describe: 'Path to a txt file containing one output directory per video',
        type: 'string',
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
/**
 * Do our own argv magic before destreamer starts.
 * ORDER IS IMPORTANT!
 * Do not mess with this.
 */
.check(() => isShowHelpRequest())
.check(argv => checkRequiredArgument(argv))
.check(argv => checkVideoUrlsArgConflict(argv))
.check(argv => checkOutputDirArgConflict(argv))
.check(argv => checkVideoUrlsInput(argv))
.check(argv => windowsFileExtensionBadBehaviorFix(argv))
.check(argv => mergeVideoUrlsArguments(argv))
.check(argv => mergeOutputDirArguments(argv))
.argv;

function hasNoArgs() {
    return process.argv.length === 2;
}

function isShowHelpRequest() {
    if (hasNoArgs()) {
        throw new Error(CLI_ERROR.GRACEFULLY_STOP);
    }

    return true;
}

function checkRequiredArgument(argv: any) {
    if (hasNoArgs()) {
        return true;
    }

    if (!argv.videoUrls && !argv.videoUrlsFile) {
        throw new Error(colors.red(CLI_ERROR.MISSING_REQUIRED_ARG));
    }

    return true;
}

function checkVideoUrlsArgConflict(argv: any) {
    if (hasNoArgs()) {
        return true;
    }

    if (argv.videoUrls && argv.videoUrlsFile) {
        throw new Error(colors.red(CLI_ERROR.VIDEOURLS_ARG_CONFLICT));
    }

    return true;
}

function checkOutputDirArgConflict(argv: any) {
    if (hasNoArgs()) {
        return true;
    }

    if (argv.outputDirectory && argv.outputDirectories) {
        throw new Error(colors.red(CLI_ERROR.OUTPUTDIR_ARG_CONFLICT));
    }

    return true;
}

function checkVideoUrlsInput(argv: any) {
    if (hasNoArgs() || !argv.videoUrls) {
        return true;
    }

    if (!argv.videoUrls.length) {
        throw new Error(colors.red(CLI_ERROR.MISSING_REQUIRED_ARG));
    }

    const t = argv.videoUrls[0] as string;
    if (t.substring(t.length-4) === '.txt') {
        throw new Error(colors.red(CLI_ERROR.FILE_INPUT_VIDEOURLS_ARG));
    }

    return true;
}

/**
 * Users see 2 separate options, but we don't really care
 * cause both options have no difference in code.
 *
 * Optimize and make this transparent to destreamer
 */
function mergeVideoUrlsArguments(argv: any) {
    if (!argv.videoUrlsFile) {
        return true;
    }

    argv.videoUrls = [argv.videoUrlsFile]; // noone will notice ;)

    // these are not valid anymore
    delete argv.videoUrlsFile;
    delete argv.F;

    return true;
}

/**
 * Users see 2 separate options, but we don't really care
 * cause both options have no difference in code.
 *
 * Optimize and make this transparent to destreamer
 */
function mergeOutputDirArguments(argv: any) {
    if (!argv.outputDirectories && argv.outputDirectory) {
        return true;
    }

    if (!argv.outputDirectory && !argv.outputDirectories) {
        argv.outputDirectory = 'videos'; // default out dir
    }
    else if (argv.outputDirectories) {
        argv.outputDirectory = argv.outputDirectories;
    }

    if (argv.outputDirectories) {
        // these are not valid anymore
        delete argv.outputDirectories;
        delete argv.O;
    }

    return true;
}

// yeah this is for windows, but lets check everyone, who knows...
function windowsFileExtensionBadBehaviorFix(argv: any) {
    if (hasNoArgs() || !argv.videoUrlsFile || !argv.outputDirectories) {
        return true;
    }

    if (!fs.existsSync(argv.videoUrlsFile)) {
        if (fs.existsSync(argv.videoUrlsFile + '.txt')) {
            argv.videoUrlsFile += '.txt';
        }
        else {
            throw new Error(colors.red(CLI_ERROR.INPUT_URLS_FILE_NOT_FOUND));
        }
    }

    return true;
}
