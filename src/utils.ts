import { execSync } from 'child_process';
import colors from 'colors';
import fs from 'fs';
import path from 'path';


function sanitizeUrls(urls: string[]) {
    const rex = new RegExp(/(?:https:\/\/)?.*\/video\/[a-z0-9]{8}-(?:[a-z0-9]{4}\-){3}[a-z0-9]{12}$/, 'i');
    const sanitized: string[] = [];

    for (let i=0, l=urls.length; i<l; ++i) {
        const urlAr = urls[i].split('?');
        const query = urlAr.length === 2 && urlAr[1] !== '' ? '?'+urlAr[1] : '';
        let url = urlAr[0];

        if (!rex.test(url)) {
            if (url !== '')
                console.warn(colors.yellow('Invalid URL at line ' + (i+1) + ', skip..'));

            continue;
        }

        if (url.substring(0, 8) !== 'https://')
            url = 'https://'+url;

        sanitized.push(url+query);
    }

    return sanitized.length ? sanitized : null;
}


export function parseVideoUrls(videoUrls: any) {
    let t = videoUrls[0] as string;
    const isPath = t.substring(t.length-4) === '.txt';
    let urls: string[];

    if (isPath) {
        if (!fs.existsSync(t)) { // uh? could this be a bad OS?
            if (fs.existsSync(t + '.txt'))
                t += '.txt';
            else
                process.exit(23);
        }

        urls = fs.readFileSync(t).toString('utf-8').split(/[\r\n]/);

    } else {
        urls = videoUrls as string[];
    }

    return sanitizeUrls(urls);
}


export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


export function checkRequirements() {
    try {
        const ffmpegVer = execSync('ffmpeg -version').toString().split('\n')[0];
        console.info(colors.green(`Using ${ffmpegVer}\n`));

    } catch (e) {
        process.exit(22);
    }
}


export function makeUniqueTitle(title: string, outDir: string) {
    let ntitle = title;
    let k = 0;

    while (fs.existsSync(outDir + path.sep + ntitle + '.mp4'))
        ntitle = title + ' - ' + (++k).toString();

    return ntitle;
}


export function ffmpegTimemarkToChunk(timemark: string) {
    const timeVals: string[] = timemark.split(':');
    const hrs = parseInt(timeVals[0]);
    const mins = parseInt(timeVals[1]);
    const secs = parseInt(timeVals[2]);

    return hrs * 1000 + mins * 100 + secs;
}
