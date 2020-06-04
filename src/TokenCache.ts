import * as fs from 'fs';
import { Session } from './Types';
import { bgGreen, bgYellow, green } from 'colors';
import jwtDecode from 'jwt-decode';

export class TokenCache {
    private tokenCacheFile: string = '.token_cache';

    public Read(): Session | null {
        let json = null;
        if (!fs.existsSync(this.tokenCacheFile)) {
            console.warn(bgYellow.black(`${this.tokenCacheFile} not found.\n`));

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
            // TODO: reimplement timeleft without another decode of the jwt
            console.info(bgGreen.black('\nAccess token still good!')); //for ${Math.floor(timeLeft / 60)} minutes.\n`));

            return session;
        }
        console.warn(bgYellow.black('\nAccess token has expired.'));

        return null;
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
