import { execSync } from 'child_process';
import colors from 'colors';
import fs from 'fs';

function sanitizeUrls(urls: string[]) {
    const rex = new RegExp(/(?:https:\/\/)?.*\/video\/[a-z0-9]{8}-(?:[a-z0-9]{4}\-){3}[a-z0-9]{12}$/, 'i');
    const sanitized: string[] = [];

    for (let i=0, l=urls.length; i<l; ++i) {
        const urlAr = urls[i].split('?');
        const query = urlAr.length === 2 && urlAr[1] !== '' ? '?'+urlAr[1] : '';
        let url = urlAr[0];

        if (!rex.test(url)) {
            if (url !== '')
                console.warn(colors.yellow("Invalid URL at line "+(i+1)+", skip..\n"));

            continue;
        }

        if (url.substring(0, 8) !== 'https://')
            url = 'https://'+url;

        sanitized.push(url+query);
    }

    return sanitized;
}

export function getVideoUrls(videoUrls: any) {
    const t = videoUrls[0] as string;
    const isPath = t.substring(t.length-4) === '.txt';
    let urls: string[];

    if (isPath)
        urls = fs.readFileSync(t).toString('utf-8').split(/[\r\n]/);
    else
        urls = videoUrls as string[];

    return sanitizeUrls(urls);
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function checkRequirements() {
    try {
        const ytdlVer = execSync('youtube-dl --version');
        console.info(colors.green(`Using youtube-dl version ${ytdlVer}`));

    } catch (e) {
        console.error(colors.red(
            'youtube-dl is missing.\nDestreamer requires a fairly recent release of youtube-dl to work properly.\n' +
            'Please install it with your preferred package manager or copy youtube-dl binary in destreamer root directory.\n'
        ));
        process.exit(22);
    }

    try {
        const ffmpegVer = execSync('ffmpeg -version').toString().split('\n')[0];
        console.info(colors.green(`Using ${ffmpegVer}\n`));

    } catch (e) {
        console.error(colors.red(
            'FFmpeg is missing.\nDestreamer requires a fairly recent release of FFmpeg to work properly.\n' +
            'Please install it with your preferred package manager or copy FFmpeg binary in destreamer root directory.\n'
        ));
        process.exit(23);
    }
}