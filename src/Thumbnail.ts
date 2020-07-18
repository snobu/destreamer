import { ApiClient } from './ApiClient';
import { Session } from './Types';

import terminalImage from 'terminal-image';
import { AxiosResponse } from 'axios';


export async function drawThumbnail(posterImage: string, session: Session): Promise<void> {
    const apiClient: ApiClient = ApiClient.getInstance(session);

    let thumbnail: Buffer = await apiClient.callUrl(posterImage, 'get', null, 'arraybuffer')
        .then((response: AxiosResponse<any> | undefined) => response?.data);

    console.log(await terminalImage.buffer(thumbnail, { width: 70 } ));
}
