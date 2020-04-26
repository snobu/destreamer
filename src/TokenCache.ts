import * as fs from 'fs-extra';
import { Session } from './Types';
import { bgGreen, bgYellow, green } from 'colors';
import jwtDecode from 'jwt-decode';
import axios from 'axios';
import colors from 'colors';

export class TokenCache {
    private tokenCacheFile: string = '.token_cache';

    public Read(): Session | null {
        let j = null;
        if(!fs.existsSync(this.tokenCacheFile)) {
            console.warn(bgYellow.black(`${this.tokenCacheFile} not found.\n`));

            return null;
        }
        let f = fs.readFileSync(this.tokenCacheFile, 'utf8');
        j = JSON.parse(f);

        interface Jwt {
            [key: string]: any
        }

        const decodedJwt: Jwt = jwtDecode(j.AccessToken);

        let now = Math.floor(Date.now() / 1000);
        let exp = decodedJwt['exp'];
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
        fs.writeFile('.token_cache', s, (err: any) => {
            if (err) {
                return console.error(err);
            }
            console.info(green('Fresh access token dropped into .token_cache'));
        });
    }

    public async RefreshToken(session: Session): Promise<string | null> {
        let endpoint = `${session.ApiGatewayUri}refreshtoken?api-version=${session.ApiGatewayVersion}`;

        let response = await axios.get(endpoint,
            {
                headers: {
                    Authorization: `Bearer ${session.AccessToken}`
                }
            });

        let freshCookie: string | null = null;

        try {
            let cookie: string = response.headers['set-cookie'].toString();
            freshCookie = cookie.split(',Authorization_Api=')[0];
        }
        catch (e) {
            console.error(colors.yellow('Error when calling /refreshtoken: Missing or unexpected set-cookie header.'));
        }

        return freshCookie;
    }
}
