import os from 'os';
import { terminal as term } from 'terminal-kit';


if (os.platform() !== "win32") {
    term.brightWhite("Platform is not Windows, let's draw some thumbnails!\n");
    let a = async () => {
        response = await axios.get(posterImageUrl, {
            headers: {
                Authorization: `Bearer ${session.AccessToken}`
            },
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream('.thumbnail.png');
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        
    };
    await a();
}

term.drawImage('.thumbnail.png', { shrink: { width: 50, height: 50 } });