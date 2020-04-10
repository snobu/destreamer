import puppeteer from 'puppeteer';
import assert from 'assert';

let browser: any;
let page: any;

before(async () => {
    browser = await puppeteer.launch({
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    page = await browser.newPage();
});

describe('Puppeteer', () => {
    it('should grab GitHub page title', async () => {
        await page.goto("https://github.com/", { waitUntil: 'networkidle2' });
        let pageTitle = await page.title();
        assert.equal(true, pageTitle.includes('GitHub'));

    }).timeout(15000); // yeah, this may take a while...
});

after(async () => {
    await browser.close();
});