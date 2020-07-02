import { ApiClient } from './ApiClient';
import { logger } from './Logger';
import { Session } from './Types';

import terminalImage from 'terminal-image';


export async function drawThumbnail(posterImage: string, session: Session): Promise<void> {
    const apiClient = ApiClient.getInstance(session);
    let thumbnail = await apiClient.callUrl(posterImage, 'get', null, 'arraybuffer');
    logger.info(await terminalImage.buffer(thumbnail?.data, { width: 70 } ));
}
