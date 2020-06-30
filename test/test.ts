import { parseInputFile } from '../src/Utils';
import puppeteer from 'puppeteer';
import assert from 'assert';
import tmp from 'tmp';
import fs from 'fs';
import { Session } from './Types';


describe('Puppeteer', () => {
    it('should grab GitHub page title', async () => {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--disable-dev-shm-usage', '--fast-start', '--no-sandbox']
        });

        const page = await browser.newPage();
        await page.goto('https://github.com/', { waitUntil: 'load' });

        let pageTitle = await page.title();
        assert.equal(true, pageTitle.includes('GitHub'));

        await browser.close();
    }).timeout(30000); // yeah, this may take a while...
});


describe('Destreamer parsing', () => {
    it('Input file to arrays of URLs and DIRs', async () => {
        const testSession: Session = {
            AccessToken: '',
            ApiGatewayUri: '',
            ApiGatewayVersion: ''
        };
        const testIn: Array<string> = [
            'https://web.microsoftstream.com/video/xxxxxxxx-aaaa-xxxx-xxxx-xxxxxxxxxxxx',
            'https://web.microsoftstream.com/video/xxxxxxxx-bbbb-xxxx-xxxx-xxxxxxxxxxxx?',
            ' -dir = "luca"',
            'https://web.microsoftstream.com/video/xxxxxxxx-cccc-xxxx-xxxx-xxxxxxxxxxxx&',
            '',
            'https://web.microsoftstream.com/video/xxxxxxxx-dddd-xxxx-xxxx-xxxxxxxxxxxx?a=b&c',
            'https://web.microsoftstream.com/video/xxxxxxxx-eeee-xxxx-xxxx-xxxxxxxxxxxx?a',
            ' -dir =\'checking/justToSee\'',
            'https://web.microsoftstream.com/video/xxxxxxxx-ffff-xxxx-xxxx-dddddddddd',
            'https://web.microsoftstream.com/video/xxxxxx-gggg-xxxx-xxxx-xxxxxxxxxxxx',
            ''
        ];
        const expectedGUIDsOut: Array<string> = [
            'xxxxxxxx-aaaa-xxxx-xxxx-xxxxxxxxxxxx',
            'xxxxxxxx-bbbb-xxxx-xxxx-xxxxxxxxxxxx',
            'xxxxxxxx-cccc-xxxx-xxxx-xxxxxxxxxxxx',
            'xxxxxxxx-dddd-xxxx-xxxx-xxxxxxxxxxxx',
            'xxxxxxxx-eeee-xxxx-xxxx-xxxxxxxxxxxx'
        ];
        const expectedDirOut: Array<string> = [
            'videos',
            'luca',
            'videos',
            'videos',
            'videos'
        ];
        const tmpFile = tmp.fileSync({ postfix: '.txt' });
        fs.writeFileSync(tmpFile.fd, testIn.join('\r\n'));
        const [testUrlOut , testDirOut]: Array<Array<string>> = await parseInputFile(tmpFile.name, 'videos', testSession);
        if (testUrlOut.length !== expectedGUIDsOut.length) {
            throw "Expected url list and test list don't have the same number of elements".red;
        }
        else if (testDirOut.length !== expectedDirOut.length) {
            throw "Expected dir list and test list don't have the same number of elements".red;
        }
        assert.deepStrictEqual(testUrlOut, expectedGUIDsOut,
            'Error in parsing the URLs, missmatch between test and expected'.red);
        assert.deepStrictEqual(testUrlOut, expectedGUIDsOut,
            'Error in parsing the DIRs, missmatch between test and expected'.red);
        assert.ok('Parsing of input file ok');
    });
});
