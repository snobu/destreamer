import { ApiClient } from './ApiClient';
import { Session } from './Types';
import { logger } from './Logger';

import terminalImage from 'terminal-image';


export async function drawThumbnail(posterImage: string, session: Session): Promise<void> {
    const apiClient = ApiClient.getInstance(session);
    let thumbnail = await apiClient.callUrl(posterImage, 'get', null, 'arraybuffer');
    logger.info(await terminalImage.buffer(thumbnail?.data, { width: 70 } ));
}
