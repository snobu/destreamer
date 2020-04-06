import axios from 'axios';
import { terminal as term } from 'terminal-kit';
import { Metadata, Session } from './Types';
import fs from 'fs';


export async function getVideoMetadata(videoGuids: string[], session: Session): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let playbackUrl: string;

    await Promise.all(videoGuids.map(async guid => {
        let apiUrl = `${session.ApiGatewayUri}videos/${guid}?api-version=${session.ApiGatewayVersion}`;
        console.log(`Calling ${apiUrl}`);
        let response = await axios.get(apiUrl,
            {
                headers: {
                    Authorization: `Bearer ${session.AccessToken}`
                }
            });

        title = response.data["name"];
        playbackUrl = response.data["playbackUrls"]
            .filter((item: { [x: string]: string; }) =>
                item["mimeType"] == "application/vnd.apple.mpegurl")
            .map((item: { [x: string]: string }) => { return item["playbackUrl"]; })[0];

        let posterImageUrl = response.data["posterImage"]["medium"]["url"];

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

        term.drawImage('.thumbnail.png', { shrink: { width: 50, height: 50 } });

        term.brightMagenta(`\n     title = ${title}\n     playbackUrl = ${playbackUrl}\n`);

        metadata.push({
            title: title,
            playbackUrl: playbackUrl
        });
    }));

    return metadata;
}