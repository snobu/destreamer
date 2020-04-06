import * as fs from 'fs';
import { Session } from './Types';
import { terminal as term } from 'terminal-kit';
const jwtDecode = require('jwt-decode');
const tokenCacheFile = '.token_cache';

export class TokenCache {

    public Read(): Session | null {
        let j = null;
        if(!fs.existsSync(tokenCacheFile)) {
            term.yellow(`${tokenCacheFile} not found.\n`);

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
        console.log("\n");
        console.log("\n");
        if (timeLeft < 120) {
            term.bgBrightYellow.black("Access token is expired.").bgDefaultColor("\n");

            return null;
        }

        term.bgBrightGreen.black(`Access token still good for ${timeLeftInMinutes} minutes.`)
            .bgDefaultColor("\n");

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
            console.log("Fresh access token dropped into .token_cache");
        });
    }
}