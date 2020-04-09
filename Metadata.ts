import axios from 'axios';
import { Metadata, Session } from './Types';


export async function getVideoMetadata(videoGuids: string[], session: Session): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let playbackUrl: string;
    let posterImage: string;

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

        posterImage = response.data["posterImage"]["medium"]["url"];

        metadata.push({
            title: title,
            playbackUrl: playbackUrl,
            posterImage: posterImage
        });
    }));

    return metadata;
}