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
    22: 'FFmpeg is missing.\n' +
        'Destreamer requires a fairly recent release of FFmpeg to download videos.\n' +
        'Please install it in $PATH or copy the ffmpeg binary to the root directory (next to package.json). \n',

    23: 'Input URL list file not found',

    33: "Can't split videoId from videoUrl",

    34: 'FFmpeg error',

    44: "Couldn't evaluate sessionInfo on the page",

    55: 'Running in an elevated shell',

    66: 'No valid URL in the input',

    0: "Clean exit with code 0."
}
