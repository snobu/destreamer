import { logger } from './Logger';
import * as puppeteer from 'puppeteer';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { chromeCacheFolder } from './destreamer';
import { argv } from './CommandLineParser';
import { ShareSession, StreamSession } from './Types';
import { ERROR_CODE } from './Errors';
import { TokenCache } from './TokenCache';


export async function doStreamLogin(url: string, tokenCache: TokenCache, username?: string): Promise<StreamSession> {
    logger.info('Launching headless Chrome to perform the OpenID Connect dance...');

    const browser: puppeteer.Browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        userDataDir: (argv.keepLoginCookies) ? chromeCacheFolder : undefined,
        defaultViewport: null,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });

    // try-finally because we were leaving zombie processes if there was an error
    try {
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


        return session;
    }
    finally {
        await browser.close();
    }
}



export async function doShareLogin(url: string, username?: string): Promise<ShareSession> {
    logger.info('Launching headless Chrome to perform the OpenID Connect dance...');

    let session: ShareSession | null = null;
    const hostname = new URL(url).host;

    const browser: puppeteer.Browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,
        devtools: argv.verbose,
        userDataDir: (argv.keepLoginCookies) ? chromeCacheFolder : undefined,
        defaultViewport: null,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });

    // try-finally because we were leaving zombie processes if there was an error
    try {
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

        logger.info('Waiting for target!');

        await browser.waitForTarget((target: puppeteer.Target) => target.url().startsWith(`https://${hostname}`), { timeout: 150000 });
        logger.info('We are logged in.');

        let tries = 1;
        while (!session) {
            const cookieJar = (await page.cookies()).filter(
                biscuit => biscuit.name == 'rtFa' || biscuit.name == 'FedAuth'
            );

            if (cookieJar.length != 2) {
                if (tries > 5) {
                    process.exit(ERROR_CODE.NO_SESSION_INFO);
                }

                await page.waitForTimeout(1000 * tries++);

                continue;
            }

            session = {
                rtFa: cookieJar.find(biscuit => biscuit.name == 'rtFa')!.value,
                FedAuth: cookieJar.find(biscuit => biscuit.name == 'FedAuth')!.value
            };
        }

        logger.info("At this point Chromium's job is done, shutting it down...\n");

        // await page.waitForTimeout(1000 * 60 * 60 * 60);
    }
    finally {
        logger.verbose('Stream login browser closing...');
        await browser.close();
        logger.verbose('Stream login browser closed');
    }

    return session;
}
