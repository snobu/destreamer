import { argv } from './CommandLineParser';
import { ERROR_CODE } from './Errors';
import { setProcessEvents } from './Events';
import { logger } from './Logger';
import { VideoUrl } from './Types';
import { checkRequirements, parseInputFile, parseCLIinput } from './Utils';

import isElevated from 'is-elevated';
import { downloadShareVideo, downloadStreamVideo } from './Downloaders';


export const chromeCacheFolder = '.chrome_data';


async function init(): Promise<void> {
    setProcessEvents(); // must be first!

    if (argv.verbose) {
        logger.level = 'verbose';
    }

    if (await isElevated()) {
        process.exit(ERROR_CODE.ELEVATED_SHELL);
    }

    checkRequirements();

    if (argv.username) {
        logger.info(`Username: ${argv.username}`);
    }

    if (argv.simulate) {
        logger.warn('Simulate mode, there will be no video downloaded. \n');
    }
}


async function main(): Promise<void> {
    await init(); // must be first
    let streamVideos: Array<VideoUrl>, shareVideos: Array<VideoUrl>;

    if (argv.videoUrls) {
        logger.info('Parsing video/group urls');
        [streamVideos, shareVideos] = await parseCLIinput(argv.videoUrls as Array<string>, argv.outputDirectory);
    }
    else {
        logger.info('Parsing input file');
        [streamVideos, shareVideos] = await parseInputFile(argv.inputFile!, argv.outputDirectory);
    }

    logger.verbose(
        'List of urls and corresponding output directory \n' +
        streamVideos.map(video => `\t${video.url} => ${video.outDir} \n`).join('') +
        shareVideos.map(video => `\t${video.url} => ${video.outDir} \n`).join('')
    );

    if (streamVideos.length) {
        await downloadStreamVideo(streamVideos);
    }
    if (shareVideos.length) {
        await downloadShareVideo(shareVideos);
    }
}


main();
