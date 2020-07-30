export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type Video = {
    title: string;
    duration: string;
    publishDate: string;
    publishTime: string;
    author: string;
    authorEmail: string;
    uniqueId: string;
    outPath: string;
    totalChunks: number;    // Abstraction of FFmpeg timemark
    playbackUrl: string;
    posterImageUrl: string;
    captionsUrl?: string
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
