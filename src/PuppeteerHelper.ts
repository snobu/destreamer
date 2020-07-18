import path from 'path';
import puppeteer from 'puppeteer';


// Thanks pkg-puppeteer [ cleaned up version :) ]
export function getPuppeteerChromiumPath(): string {
    const isPkg: boolean = __filename.includes('snapshot');

    const replaceRegex: RegExp = (process.platform === 'win32') ?
        new RegExp(/^.*?\\node_modules\\puppeteer\\\.local-chromium/) :
        new RegExp(/^.*?\/node_modules\/puppeteer\/\.local-chromium/);

    if (!isPkg) {
        return puppeteer.executablePath();
    }

    const browserPath: string = puppeteer.executablePath()
        .replace(replaceRegex, path.join(path.dirname(process.execPath), 'chromium'));

    return browserPath;
}
