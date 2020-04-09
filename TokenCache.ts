import * as fs from 'fs';
import { Session } from './Types';
import { bgGreen, bgYellow, green } from 'colors';
const jwtDecode = require('jwt-decode');


const tokenCacheFile = '.token_cache';

export class TokenCache {

    public Read(): Session | null {
        let j = null;
        if(!fs.existsSync(tokenCacheFile)) {
            console.warn(bgYellow.black(`${tokenCacheFile} not found.\n`));

            return null;
        }
        let f = fs.readFileSync(tokenCacheFile, "utf8");
        j = JSON.parse(f);

        interface Jwt {
            [key: string]: any
        }

        const decodedJwt: Jwt = jwtDecode(j.AccessToken);

        let now = Math.floor(Date.now() / 1000);
        let exp = decodedJwt["exp"];
        let timeLeft = exp - now;

        let timeLeftInMinutes = Math.floor(timeLeft / 60);
        if (timeLeft < 120) {
            console.warn(bgYellow.black('\nAccess token has expired.'));

            return null;
        }

        console.info(bgGreen.black(`\nAccess token still good for ${timeLeftInMinutes} minutes.\n`));

        let session: Session = {
            AccessToken: j.AccessToken,
            ApiGatewayUri: j.ApiGatewayUri,
            ApiGatewayVersion: j.ApiGatewayVersion
        };

        return session;
    }

    public Write(session: Session): void {
        let s = JSON.stringify(session, null, 4);
        fs.writeFile(".token_cache", s, (err: any) => {
            if (err) {
                return console.error(err);
            }
            console.info(green('Fresh access token dropped into .token_cache'));
        });
    }
}