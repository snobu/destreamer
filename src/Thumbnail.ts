import terminalImage from 'terminal-image';
import { ApiClient } from './ApiClient';


export async function drawThumbnail(posterImage: string, cookie: string): Promise<void> {
    const apiClient = ApiClient.getInstance();

    let thumbnail = await apiClient.callUrl(posterImage, 'get', cookie, null, 'arraybuffer');
    console.log(await terminalImage.buffer(thumbnail?.data));
}
