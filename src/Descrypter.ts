import { ApiClient } from './ApiClient';
import { Session } from './Types';

import crypto from 'crypto';
import { logger } from './Logger';
// import Axios from 'axios';


/* export async function getDecrypter(playlistUrl: string, session: Session): Promise<crypto.Decipher> {
    
    return new Promise<crypto.Decipher>(async (resolve, reject) => {
        const apiClient = ApiClient.getInstance(session);

        const keyOption = await apiClient.callUrl(playlistUrl, 'get', null, 'text')
            .then(res => (res?.data as string).split(/\r?\n/)
                .find(line => line.startsWith('#EXT-X-KEY')));

        if (keyOption) {

            const match = RegExp(/#EXT-X-KEY:METHOD=(.*?),URI="(.*?),IV=0X(.*)/).exec(keyOption);

            if (!match) {
                throw new Error();
            }

            const algorithm = match[1].toLowerCase().replace('-', '');

            const key: Buffer = await apiClient.callUrl(match[2], 'get', null, 'arraybuffer')
                .then(res => res?.data);

            const iv = Buffer.from(match[3].substring(2), 'hex');

            resolve(crypto.createDecipheriv(algorithm, key, iv));
        }
        else {
            reject();
        }
    });
} */


export async function getDecrypter(playlistUrl: string, session: Session): Promise<crypto.Decipher> {
    const apiClient = ApiClient.getInstance(session);

    /* Axios.get(playlistUrl, {
        headers: {
            'Authorization': 'Bearer ' + session?.AccessToken,
            'User-Agent': 'destreamer/3.0 (beta)'
        },
        responseType: 'text'
    })
    .then(res => logger.warn(res.data.split(/\r?\n/)[0]))
    .catch(err => logger.error(err)); */

    const keyOption = await apiClient.callUrl(playlistUrl, 'get', null, 'text')
        .catch(err => logger.debug(err))
        .then(res => (res?.data as string).split(/\r?\n/)
            .find(line => line.startsWith('#EXT-X-KEY')));

    if (keyOption) {
        logger.debug('CRIPTO LINE IN M3U8: ' + keyOption);

        const match = RegExp(/#EXT-X-KEY:METHOD=(.*?),URI="(.*?)",IV=0X(.*)/).exec(keyOption);

        if (!match) {
            throw new Error('No match for regex');
        }

        const algorithm = match[1].toLowerCase().replace('-', '');

        const key: Buffer = await apiClient.callUrl(match[2], 'post', null, 'arraybuffer')
            .then(res => res?.data);

        const iv = Buffer.from(match[3], 'hex');

        return crypto.createDecipheriv(algorithm, key, iv);
    }
    else {
        process.exit(555);
    }
}

/*
const input = fs.createReadStream('test.enc');
const output = fs.createWriteStream('test.js');

input.pipe(decipher).pipe(output);
*/
