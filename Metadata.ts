import axios, { AxiosError } from 'axios';
import { terminal as term } from 'terminal-kit';
import { Metadata, Session } from './Types';


export async function getVideoMetadata(videoGuids: string[], session: Session): Promise<Metadata[]> {
    let metadata: Metadata[] = [];
    videoGuids.forEach(async guid => {
        let apiUrl = `${session.ApiGatewayUri}videos/${guid}?api-version=${session.ApiGatewayVersion}`;
        console.log(`Calling ${apiUrl}`);
        let content = axios.get(
            apiUrl,
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
                    `${error.response?.status} ${error.response?.statusText}\n`);
                console.dir(error.response?.data);
                term.red("This is an unrecoverable error. Exiting...\n");
                process.exit(29);
            });


            let title: string = await content.then(data => {
                return data["name"];
            });

            let playbackUrl: string = await content.then(data => {
                let playbackUrl = null;
                try {
                    playbackUrl = data["playbackUrls"]
                        .filter((item: { [x: string]: string; }) =>
                            item["mimeType"] == "application/vnd.apple.mpegurl")
                        .map((item: { [x: string]: string }) =>
                            { return item["playbackUrl"]; })[0];
                }
                catch (e) {
                    console.error(`Error fetching HLS URL: ${e.message}.\n playbackUrl is ${playbackUrl}`);
                    process.exit(27);
                }

                return playbackUrl;
            });

            console.log(`title = ${title} \n playbackUrl = ${playbackUrl}`)

            metadata.push({
                title: title,
                playbackUrl: playbackUrl
            });

            
        });

        console.log(`metadata--------`)
        console.dir(metadata);
        return metadata;
}