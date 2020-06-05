import { parseVideoUrls } from '../src/Utils';
import puppeteer from 'puppeteer';
import assert from 'assert';
import tmp from 'tmp';
import fs from 'fs';

let browser: any;
let page: any;

describe('Puppeteer', () => {
    it('should grab GitHub page title', async () => {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--fast-start', '--no-sandbox']
        });
        page = await browser.newPage();
        await page.goto('https://github.com/', { waitUntil: 'load' });
        let pageTitle = await page.title();
        assert.equal(true, pageTitle.includes('GitHub'));
        await browser.close();
    }).timeout(25000); // yeah, this may take a while...
});

describe('Destreamer', () => {
    it('should parse and sanitize URL list from file', () => {
        const testIn: string[] = [
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd?',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd&',
            '',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd?a=b&c',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd?a',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddd',
            'https://web.microsoftstream.com/video/xxxxxx-zzzz-hhhh-rrrr-dddddddddddd',
            ''
        ];
        const expectedOut: string[] = [
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd',
            'https://web.microsoftstream.com/video/xxxxxxxx-zzzz-hhhh-rrrr-dddddddddddd'
        ];
        const tmpFile = tmp.fileSync({ postfix: '.txt' });
        let testOut: string[];

        fs.writeFileSync(tmpFile.fd, testIn.join('\r\n'));

        testOut = parseVideoUrls([tmpFile.name])!;
        if (testOut.length !== expectedOut.length) {
            assert.strictEqual(testOut, expectedOut, 'URL list not sanitized');
        }

        for (let i=0, l=testOut.length; i<l; ++i) {
            if (testOut[i] !== expectedOut[i]) {
                assert.strictEqual(testOut[i], expectedOut[i], 'URL not sanitized');
            }
        }

        assert.ok('sanitizeUrls ok');
    });
});
