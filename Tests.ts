import puppeteer from 'puppeteer';

export async function BrowserTests() {
    console.log('[BROWSER TEST] Launching headless Chrome...');
    const browser = await puppeteer.launch({
        // Switch to false if you need to login interactively
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.goto("https://github.com/", { waitUntil: 'networkidle2' });
    let pageTitle = await page.title();
    await browser.close();
    if (!pageTitle.includes('GitHub')) {
        console.log('[BROWSER TEST] FAIL: Page title does not include "GitHub"');
        process.exit(44);
    }
    console.log('[BROWSER TEST] PASS');
}
