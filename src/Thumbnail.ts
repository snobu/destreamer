import { StreamApiClient } from './ApiClient';
import { StreamSession } from './Types';

import terminalImage from 'terminal-image';
import { AxiosResponse } from 'axios';


export async function drawThumbnail(posterImage: string, session: StreamSession): Promise<void> {
    const apiClient: StreamApiClient = StreamApiClient.getInstance(session);

    const thumbnail: Buffer = await apiClient.callUrl(posterImage, 'get', null, 'arraybuffer')
        .then((response: AxiosResponse<any> | undefined) => response?.data);

    console.log(await terminalImage.buffer(thumbnail, { width: 70 } ));
}
