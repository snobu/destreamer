import * as fs from 'fs';
import { Session } from './Types';
const jwtDecode = require('jwt-decode');

export class TokenCache {

    public Read(): Session | null {
        let j = null;
        try {
            let f = fs.readFileSync(".token_cache", "utf8");
            j = JSON.parse(f);
        }
        catch (e) {
            console.error(e);
            
            return null;
        }

        interface Jwt {
            [key: string]: any
        }

        const decodedJwt: Jwt = jwtDecode(j.accessToken);

        let now = Math.floor(Date.now() / 1000);
        let exp = decodedJwt["exp"];
        let timeLeft = exp - now;

        if (timeLeft < 120) {
            return null;
        }

        let session: Session = {
            AccessToken: j.accessToken,
            ApiGatewayUri: j.apiGatewayUri,
            ApiGatewayVersion: j.apiGatewayVersion
        }

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