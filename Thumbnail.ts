import { terminal as term } from 'terminal-kit';
import { execSync } from 'child_process';


export function drawThumbnail(posterImage: string, accessToken: string): void {
    let fetchCmd = `ffmpeg -hide_banner -loglevel warning ` +
        `-headers "Authorization: Bearer ${accessToken}\r\n" ` +
        `-i "${posterImage}" -y .thumbnail.png`;
    execSync(fetchCmd, { stdio: 'inherit' });
    try {
        term.drawImage('.thumbnail.png', { shrink: { width: 50, height: 50 } });
    }
    catch (e) {
        console.error(e);
    }
}
