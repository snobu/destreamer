import { Metadata, Session } from './Types';

import { parse } from 'iso8601-duration';
import axios from 'axios';

function publishedDateToString(date: string) {
    const dateJs = new Date(date);
    const day = dateJs.getDate().toString().padStart(2, '0');
    const month = (dateJs.getMonth() + 1).toString(10).padStart(2, '0');

    return day+'-'+month+'-'+dateJs.getFullYear();
}

function durationToTotalChuncks(duration: string) {
    const durationObj = parse(duration);
    const hrs = durationObj['hours'] ?? 0;
    const mins = durationObj['minutes'] ?? 0;
    const secs = Math.ceil(durationObj['seconds'] ?? 0);

    return hrs * 1000 + mins * 100 + secs;
}


export async function getVideoMetadata(videoGuids: string[], session: Session, verbose: boolean): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let date: string;
    let duration: number;
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
        duration = durationToTotalChuncks(response.data.media['duration']);

        metadata.push({
            date: date,
            duration: duration,
            title: title,
            playbackUrl: playbackUrl,
            posterImage: posterImage
        });
    }));

    return metadata;
}
