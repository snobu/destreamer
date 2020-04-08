import { terminal as term } from 'terminal-kit';
import { execSync } from 'child_process';
import terminalImage from 'terminal-image';
import axios from 'axios';

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
