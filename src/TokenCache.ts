import { chromeCacheFolder } from './destreamer';
import { ERROR_CODE } from './Errors';
import { logger } from './Logger';
import { getPuppeteerChromiumPath } from './PuppeteerHelper';
import { Session } from './Types';

import fs from 'fs';
import jwtDecode from 'jwt-decode';
import puppeteer from 'puppeteer';


export class TokenCache {
    private tokenCacheFile: string = '.token_cache';

    public Read(): Session | null {
        let json = null;
        if (!fs.existsSync(this.tokenCacheFile)) {
            logger.warn(`${this.tokenCacheFile} not found. \n`);

            return null;
        }
        let file = fs.readFileSync(this.tokenCacheFile, 'utf8');
        json = JSON.parse(file);

        let session: Session = {
            AccessToken: json.AccessToken,
            ApiGatewayUri: json.ApiGatewayUri,
            ApiGatewayVersion: json.ApiGatewayVersion
        };

        if (this.checkValid(session)) {
            // TODO: re-implement timeleft without another decode of the jwt
            logger.info('Access token still good! \n'.green); //for ${Math.floor(timeLeft / 60)} minutes.\n`));

            return session;
        }
        logger.warn('Access token has expired! \n');

        return null;
    }

    public Write(session: Session): void {
        let s = JSON.stringify(session, null, 4);
        fs.writeFile('.token_cache', s, (err: any) => {
            if (err) {
                return logger.error(err);
            }
            logger.info('Fresh access token dropped into .token_cachen \n'.green);
        });
    }

    public checkValid(session: Session): boolean {
        interface Jwt {
            [key: string]: any
        }
        const decodedJwt: Jwt = jwtDecode(session.AccessToken);

        let now = Math.floor(Date.now() / 1000);
        let exp = decodedJwt['exp'];
        let timeLeft = exp - now;

        if (timeLeft < 120) {
            return false;
        }

        return true;
    }
}


export async function refreshSession() {
    const url = 'https://web.microsoftstream.com';

    const browser = await puppeteer.launch({
        executablePath: getPuppeteerChromiumPath(),
        headless: false,            // NEVER TRUE OR IT DOES NOT WORK
        userDataDir: chromeCacheFolder,
        args: [
            '--disable-dev-shm-usage',
            '--fast-start',
            '--no-sandbox'
        ]
    });

    const page = (await browser.pages())[0];
    await page.goto(url, { waitUntil: 'load' });

    await browser.waitForTarget(target => target.url().includes(url), { timeout: 30000 });

    let session = null;
    let tries: number = 1;

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
            await page.waitFor(3000);
        }
    }
    browser.close();

    return session;
}
