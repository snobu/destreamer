export type StreamSession = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type VideoUrl = {
    url: string,
    outDir: string
}


export type SharepointVideo = {
    // if we can download the MP4 or we need to use DASH
    direct: boolean;
    playbackUrl: string;
    title: string;
    outPath: string
}


export type StreamVideo = {
    guid: string;
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
    posterImageUrl: string | null;
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
