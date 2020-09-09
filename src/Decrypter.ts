import { ApiClient } from './ApiClient';
import { logger } from './Logger';
import { Session } from './Types';

import crypto from 'crypto';


export async function getDecrypter(playlistUrl: string, session: Session): Promise<crypto.Decipher> {
    const apiClient = ApiClient.getInstance(session);

    const keyOption = await apiClient.callUrl(playlistUrl, 'get', null, 'text')
        .then(res => (res?.data as string).split(/\r?\n/)
            .find(line => line.startsWith('#EXT-X-KEY')));

    if (keyOption) {
        logger.debug('[Decrypter] CRIPTO LINE IN M3U8: ' + keyOption);

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
