import axios, { AxiosError } from 'axios';
import { terminal as term } from 'terminal-kit';
import { Metadata } from './Types';


export async function getVideoMetadata(videoGuids: string[], session: any): Promise<Metadata[]> {
    let metadata: Metadata[];
    videoGuids.forEach(async guid => {
        let content = axios.get(
            `${session.ApiGatewayUri}videos/${guid}?api-version=${session.ApiGatewayVersion}`,
            {
                headers: {
                    Authorization: `Bearer ${session.AccessToken}`
                }
            })
            .then(response => {
                return response.data;
            })
            .catch((error: AxiosError) => {
                term.red('Error when calling Microsoft Stream API: ' +
                    `${error.response?.status} ${error.response?.statusText}`);
                term.red("This is an unrecoverable error. Exiting...");
                process.exit(29);
            });


            let title = await content.then(data => {
                return data["name"];
            });

            let playbackUrl = await content.then(data => {
                // if (verbose) {
                //     console.log(JSON.stringify(data, undefined, 2));
                // }
                let playbackUrl = null;
                try {
                    playbackUrl = data["playbackUrls"]
                        .filter((item: { [x: string]: string; }) =>
                            item["mimeType"] == "application/vnd.apple.mpegurl")
                        .map((item: { [x: string]: string }) =>
                            { return item["playbackUrl"]; })[0];
                }
                catch (e) {
                    console.error(`Error fetching HLS URL: ${e}.\n playbackUrl is ${playbackUrl}`);
                    process.exit(27);
                }

                return playbackUrl;
            });

            metadata.push({
                title: title,
                playbackUrl: playbackUrl
            });

        });

        return metadata;
}