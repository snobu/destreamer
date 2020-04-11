export type Session = {
    AccessToken: string;
    ApiGatewayUri: string;
    ApiGatewayVersion: string;
}


export type Metadata = {
    date: string;
    duration: number;
    title: string;
    playbackUrl: string;
    posterImage: string;
}


interface Errors {
    [key: number]: string
}

// I didn't use an enum because there is no real advantage that i can find and
// we can't use multiline string for long errors
// TODO: create better errors descriptions
export const Errors: Errors = {
    22: 'FFmpeg is missing. \n' +
        'Destreamer requires a fairly recent release of FFmpeg to work properly. \n' +
        'Please install it with your preferred package manager or copy FFmpeg binary in destreamer root directory. \n',

    33: 'cannot split videoID from videUrl \n',

    44: 'couldn\'t evaluate sessionInfo in the page \n',

    55: 'running in an elevated shell \n',

    66: 'no valid URL in the input \n'
}
