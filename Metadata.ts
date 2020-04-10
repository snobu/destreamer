import { Metadata, Session } from './Types';

import axios from 'axios';


export async function getVideoMetadata(videoGuids: string[], session: Session, verbose: boolean): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let playbackUrl: string;
    let posterImage: string;

    await Promise.all(videoGuids.map(async guid => {
        let apiUrl = `${session.ApiGatewayUri}videos/${guid}?api-version=${session.ApiGatewayVersion}`;

        if (verbose)
            console.info(`Calling ${apiUrl}`);

        let response = await axios.get(apiUrl,
            {
                headers: {
                    Authorization: `Bearer ${session.AccessToken}`
                }
            });

        title = response.data['name'];
        playbackUrl = response.data['playbackUrls']
            .filter((item: { [x: string]: string; }) =>
                item['mimeType'] == 'application/vnd.apple.mpegurl')
            .map((item: { [x: string]: string }) => { return item['playbackUrl']; })[0];

        posterImage = response.data['posterImage']['medium']['url'];

        metadata.push({
            title: title,
            playbackUrl: playbackUrl,
            posterImage: posterImage
        });
    }));

    return metadata;
}