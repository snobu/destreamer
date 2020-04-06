import axios, { AxiosError } from 'axios';
import { terminal as term } from 'terminal-kit';
import { Metadata, Session } from './Types';


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

        title = await response.data["name"];
        playbackUrl = await response.data["playbackUrls"]
            .filter((item: { [x: string]: string; }) =>
                item["mimeType"] == "application/vnd.apple.mpegurl")
            .map((item: { [x: string]: string }) => { return item["playbackUrl"]; })[0];


        term.brightMagenta(`\n     title = ${title}\n     playbackUrl = ${playbackUrl}\n`);

        metadata.push({
            title: title,
            playbackUrl: playbackUrl
        });
    }));

    return metadata;
}