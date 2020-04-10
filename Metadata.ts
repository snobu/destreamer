import { Metadata, Session } from './Types';

import axios from 'axios';

function publishedDateToString(date: string) {
    const dateJs = new Date(date);
    const day = dateJs.getDate().toString().padStart(2, '0');
    const month = (dateJs.getMonth() + 1).toString(10).padStart(2, '0');

    return day+'-'+month+'-'+dateJs.getFullYear();
}

export async function getVideoMetadata(videoGuids: string[], session: Session, verbose: boolean): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let date: string;
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
        date = publishedDateToString(response.data['publishedDate']);

        metadata.push({
            date: date,
            title: title,
            playbackUrl: playbackUrl,
            posterImage: posterImage
        });
    }));

    return metadata;
}