export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}

export type Video = {
    date: string;
    totalChunks: number; // Abstraction of FFmpeg timemark
    title: string;
    outDir?: string;
    playbackUrl: string;
    posterImage: string;
}
