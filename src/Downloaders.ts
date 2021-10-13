import { StreamApiClient } from './ApiClient';
import { argv } from './CommandLineParser';
import { ERROR_CODE } from './Errors';
import { logger } from './Logger';
import { doStreamLogin } from './LoginModules';
import { drawThumbnail } from './Thumbnail';
import { refreshSession, TokenCache } from './TokenCache';
import { StreamVideo, VideoUrl } from './Types';
import { ffmpegTimemarkToChunk } from './Utils';
import { createUniquePath, getStreamInfo } from './VideoUtils';

import cliProgress from 'cli-progress';
import fs from 'fs';


const { FFmpegCommand, FFmpegInput, FFmpegOutput } = require('@tedconf/fessonia')();
const tokenCache: TokenCache = new TokenCache();


export async function downloadStreamVideo(videoUrls: Array<VideoUrl>): Promise<void> {

    let session = tokenCache.Read() ?? await doStreamLogin('https://web.microsoftstream.com/', tokenCache, argv.username);
    logger.verbose('Session and API info \n' +
        '\t API Gateway URL: '.cyan + session.ApiGatewayUri + '\n' +
        '\t API Gateway version: '.cyan + session.ApiGatewayVersion + '\n');


    logger.info('Fetching videos info... \n');

    const videos: Array<StreamVideo> = createUniquePath(
        await getStreamInfo(videoUrls, session, argv.closedCaptions),
        argv.outputTemplate, argv.format, argv.skip
    );

    if (argv.simulate) {
        videos.forEach((video: StreamVideo) => {
            logger.info(
                '\nTitle:          '.green + video.title +
                '\nOutPath:        '.green + video.outPath +
                '\nPublished Date: '.green + video.publishDate +
                '\nPlayback URL:   '.green + video.playbackUrl +
                ((video.captionsUrl) ? ('\nCC URL:         '.green + video.captionsUrl) : '')
            );
        });

        return;
    }

    for (const [index, video] of videos.entries()) {

        if (argv.skip && fs.existsSync(video.outPath)) {
            logger.info(`File already exists, skipping: ${video.outPath} \n`);
            continue;
        }

        if (argv.keepLoginCookies && index !== 0) {
            logger.info('Trying to refresh token...');
            session = await refreshSession('https://web.microsoftstream.com/video/' + video.guid);
            StreamApiClient.getInstance().setSession(session);
        }

        const pbar: cliProgress.SingleBar = new cliProgress.SingleBar({
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            format: 'progress [{bar}] {percentage}% {speed} {eta_formatted}',
            // process.stdout.columns may return undefined in some terminals (Cygwin/MSYS)
            barsize: Math.floor((process.stdout.columns || 30) / 3),
            stopOnComplete: true,
            hideCursor: true,
        });

        logger.info(`\nDownloading Video: ${video.title} \n`);
        logger.verbose('Extra video info \n' +
            '\t Video m3u8 playlist URL: '.cyan + video.playbackUrl + '\n' +
            '\t Video tumbnail URL: '.cyan + video.posterImageUrl + '\n' +
            '\t Video subtitle URL (may not exist): '.cyan + video.captionsUrl + '\n' +
            '\t Video total chunks: '.cyan + video.totalChunks + '\n');

        logger.info('Spawning ffmpeg with access token and HLS URL. This may take a few seconds...\n\n');
        if (!process.stdout.columns) {
            logger.warn(
                'Unable to get number of columns from terminal.\n' +
                'This happens sometimes in Cygwin/MSYS.\n' +
                'No progress bar can be rendered, however the download process should not be affected.\n\n' +
                'Please use PowerShell or cmd.exe to run destreamer on Windows.'
            );
        }

        const headers: string = 'Authorization: Bearer ' + session.AccessToken;

        if (!argv.noExperiments) {
            if (video.posterImageUrl) {
                await drawThumbnail(video.posterImageUrl, session);
            }
        }

        const ffmpegInpt: any = new FFmpegInput(video.playbackUrl, new Map([
            ['headers', headers]
        ]));
        const ffmpegOutput: any = new FFmpegOutput(video.outPath, new Map([
            argv.acodec === 'none' ? ['an', null] : ['c:a', argv.acodec],
            argv.vcodec === 'none' ? ['vn', null] : ['c:v', argv.vcodec],
            ['n', null]
        ]));
        const ffmpegCmd: any = new FFmpegCommand();

        const cleanupFn: () => void = () => {
            pbar.stop();

            if (argv.noCleanup) {
                return;
            }

            try {
                fs.unlinkSync(video.outPath);
            }
            catch (e) {
                // Future handling of an error (maybe)
            }
        };

        pbar.start(video.totalChunks, 0, {
            speed: '0'
        });

        // prepare ffmpeg command line
        ffmpegCmd.addInput(ffmpegInpt);
        ffmpegCmd.addOutput(ffmpegOutput);
        if (argv.closedCaptions && video.captionsUrl) {
            const captionsInpt: any = new FFmpegInput(video.captionsUrl, new Map([
                ['headers', headers]
            ]));

            ffmpegCmd.addInput(captionsInpt);
        }

        ffmpegCmd.on('update', async (data: any) => {
            const currentChunks: number = ffmpegTimemarkToChunk(data.out_time);

            pbar.update(currentChunks, {
                speed: data.bitrate
            });

            // Graceful fallback in case we can't get columns (Cygwin/MSYS)
            if (!process.stdout.columns) {
                process.stdout.write(`--- Speed: ${data.bitrate}, Cursor: ${data.out_time}\r`);
            }
        });

        process.on('SIGINT', cleanupFn);

        // let the magic begin...
        await new Promise((resolve: any) => {
            ffmpegCmd.on('error', (error: any) => {
                cleanupFn();

                logger.error(`FFmpeg returned an error: ${error.message}`);
                process.exit(ERROR_CODE.UNK_FFMPEG_ERROR);
            });

            ffmpegCmd.on('success', () => {
                pbar.update(video.totalChunks); // set progress bar to 100%
                logger.info(`\nDownload finished: ${video.outPath} \n`);
                resolve();
            });

            ffmpegCmd.spawn();
        });

        process.removeListener('SIGINT', cleanupFn);
    }
}
