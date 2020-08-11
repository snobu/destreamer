import { Metadata, Session } from './Types';
import { forEachAsync } from './Utils';
import { ApiClient } from './ApiClient';

import { parse } from 'iso8601-duration';


function publishedDateToString(date: string) {
    const dateJs = new Date(date);
    const day = dateJs.getDate().toString().padStart(2, '0');
    const month = (dateJs.getMonth() + 1).toString(10).padStart(2, '0');
    const publishedDate = day + '-' + month + '-' + dateJs.getFullYear();

    return publishedDate;
}

function durationToTotalChunks(duration: string) {
    const durationObj = parse(duration);
    const hrs = durationObj['hours'] ?? 0;
    const mins = durationObj['minutes'] ?? 0;
    const secs = Math.ceil(durationObj['seconds'] ?? 0);

    return (hrs * 60) + mins + (secs / 60);
}

export async function getVideoMetadata(videoGuids: string[], session: Session): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    let title: string;
    let date: string;
    let totalChunks: number;
    let playbackUrl: string;
    let posterImage: string;

    const apiClient = ApiClient.getInstance(session);

    await forEachAsync(videoGuids, async (guid: string) => {
        let response = await apiClient.callApi('videos/' + guid, 'get');

        title = response?.data['name'];
        playbackUrl = response?.data['playbackUrls']
            .filter((item: { [x: string]: string; }) =>
                item['mimeType'] == 'application/vnd.apple.mpegurl')
            .map((item: { [x: string]: string }) => {
                return item['playbackUrl'];
            })[0];

        posterImage = response?.data['posterImage']['medium']['url'];
        date = publishedDateToString(response?.data['publishedDate']);
        totalChunks = durationToTotalChunks(response?.data.media['duration']);

        metadata.push({
            date: date,
            totalChunks: totalChunks,
            title: title,
            playbackUrl: playbackUrl,
            posterImage: posterImage
        });
    });

    return metadata;
}
