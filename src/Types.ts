export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type Video = {
    date: string;
    title: string;
    outPath: string;
    totalChunks: number;    // Abstraction of FFmpeg timemark
    playbackUrl: string;
    posterImageUrl: string;
    captionsUrl?: string
}
