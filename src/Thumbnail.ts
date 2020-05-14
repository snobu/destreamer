import { ApiClient } from './ApiClient';
import { Session } from './Types';
import terminalImage from 'terminal-image';


export async function drawThumbnail(posterImage: string, session: Session): Promise<void> {
    const apiClient = ApiClient.getInstance(session);
    let thumbnail = await apiClient.callUrl(posterImage, 'get', null, 'arraybuffer');
    console.log(await terminalImage.buffer(thumbnail?.data, { width: 70 } ));
}
