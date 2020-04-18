export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}

export type Metadata = {
    date: string;
    totalChunks: number; // Abstraction of FFmpeg timemark
    title: string;
    playbackUrl: string;
    posterImage: string;
}