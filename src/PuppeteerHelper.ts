import path from 'path';
import puppeteer from 'puppeteer';

// Thanks pkg-puppeteer [ cleaned up version :) ]
export function getPuppeteerChromiumPath() {
    const isPkg = __filename.includes('snapshot');
    const macOS_Linux_rex = /^.*?\/node_modules\/puppeteer\/\.local-chromium/;
    const win32_rex = /^.*?\\node_modules\\puppeteer\\\.local-chromium/;
    const replaceRegex = process.platform === 'win32' ? win32_rex : macOS_Linux_rex;

    if (!isPkg) {
        return puppeteer.executablePath();
    }

    const browserPath = puppeteer.executablePath()
        .replace(replaceRegex, path.join(path.dirname(process.execPath), 'chromium'));

    return browserPath;
}