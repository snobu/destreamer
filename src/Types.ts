export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type Video = {
    // the following properties are all for the title template
    title: string;
    duration: string;
    publishDate: string;
    publishTime: string;
    author: string;
    authorEmail: string;
    uniqueId: string;

    // the following properties are all the urls neede for the download
    playbackUrl: string;
    posterImageUrl: string;
    captionsUrl?: string

    // final filename, already sanitized and unique
    filename: string;
    // complete path to save the video
    outPath: string;
}


/* TODO: expand this template once we are all on board with a list
see https://github.com/snobu/destreamer/issues/190#issuecomment-663718010 for list*/
export const templateElements: Array<string> = [
    'title',
    'duration',
    'publishDate',
    'publishTime',
    'author',
    'authorEmail',
    'uniqueId'
];
