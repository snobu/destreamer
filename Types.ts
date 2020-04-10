export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type Metadata = {
    title: string;
    playbackUrl: string;
    posterImage: string;
}


interface Errors {
    [key: number]: string
}

export const Errors: Errors = {
    22: 'ffmpeg not found in $PATH',
    25: 'cannot split videoID from videUrl',
    27: 'no hlsUrl in the API response',
    29: 'invalid response from API',
    88: 'error extracting cookies'
}
