import terminalImage from 'terminal-image';
import axios from 'axios';

axios.defaults.headers.common['User-Agent'] = 'destreamer/2.0';

export async function drawThumbnail(posterImage: string, accessToken: string) {
    let thumbnail = await axios.get(posterImage,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            responseType: 'arraybuffer'
        });
    console.log(await terminalImage.buffer(thumbnail.data));
}
