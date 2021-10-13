import { logger } from './Logger';
import puppeteer from 'puppeteer';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { chromeCacheFolder } from './destreamer';
import { argv } from './CommandLineParser';
import { StreamSession } from './Types';
import { ERROR_CODE } from './Errors';
import { TokenCache } from './TokenCache';


export async function doStreamLogin(url: string, tokenCache: TokenCache, username?: string): Promise<StreamSession> {

    logger.info('Launching headless Chrome to perform the OpenID Connect dance...');

    const browser: puppeteer.Browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        userDataDir: (argv.keepLoginCookies) ? chromeCacheFolder : undefined,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });
    const page: puppeteer.Page = (await browser.pages())[0];

    logger.info('Navigating to login page...');
    await page.goto(url, { waitUntil: 'load' });

    try {
        if (username) {
            await page.waitForSelector('input[type="email"]', { timeout: 3000 });
            await page.keyboard.type(username);
            await page.click('input[type="submit"]');
        }
        else {
            /* If a username was not provided we let the user take actions that
            lead up to the video page. */
        }
    }
    catch (e) {
        /* If there is no email input selector we aren't in the login module,
        we are probably using the cache to aid the login.
        It could finish the login on its own if the user said 'yes' when asked to
        remember the credentials or it could still prompt the user for a password */
    }

    await browser.waitForTarget((target: puppeteer.Target) => target.url().endsWith('microsoftstream.com/'), { timeout: 150000 });
    logger.info('We are logged in.');

    let session: StreamSession | null = null;
    let tries = 1;
    while (!session) {
        try {
            let sessionInfo: any;
            session = await page.evaluate(
                () => {
                    return {
                        AccessToken: sessionInfo.AccessToken,
                        ApiGatewayUri: sessionInfo.ApiGatewayUri,
                        ApiGatewayVersion: sessionInfo.ApiGatewayVersion
                    };
                }
            );
        }
        catch (error) {
            if (tries > 5) {
                process.exit(ERROR_CODE.NO_SESSION_INFO);
            }

            session = null;
            tries++;
            await page.waitForTimeout(3000);
        }
    }

    tokenCache.Write(session);
    logger.info('Wrote access token to token cache.');
    logger.info("At this point Chromium's job is done, shutting it down...\n");

    await browser.close();

    return session;
}
