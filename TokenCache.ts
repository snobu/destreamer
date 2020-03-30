import * as fs from 'fs';
const jwtDecode = require('jwt-decode');

export class TokenCache {

    public Read(): string | null {
        let token = null;
        try {
            token = fs.readFileSync(".token_cache", "utf8");
        }
        catch (e) {
            console.error(e);
            
            return null;
        }

        interface Jwt {
            [key: string]: any
        }

        const decodedJwt: Jwt = jwtDecode(token);

        let now = Math.floor(Date.now() / 1000);
        let exp = decodedJwt["exp"];
        let timeLeft = exp - now;

        if (timeLeft < 120) {
            return null;
        }

        return token;
    }

    public Write(token: string): void {
        fs.writeFile(".token_cache", token, (err: any) => {
            if (err) {
                return console.error(err);
            }
            console.log("Fresh access token dropped into .token_cache");
        });
    }
}