import axios from 'axios';
import { terminal as term } from 'terminal-kit';


export interface Metadata {
    title: string;
    playbackUrl: string;
}

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
            .then(function (response) {
                return response.data;
            })
            .catch(function (error) {
                term.red('Error when calling Microsoft Stream API: ' +
                    `${error.response.status} ${error.response.reason}`);
                console.error(error.response.status);
                console.error(error.response.data);
                console.error("Exiting...");
                if (argv.verbose) {
                    console.error(`[VERBOSE] ${error}`);
                }
                process.exit(29);
            });


            let title = await content.then(data => {
                return data["name"];
            });

            let playbackUrl = await content.then(data => {
                if (argv.verbose) {
                    console.log(JSON.stringify(data, undefined, 2));
                }
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