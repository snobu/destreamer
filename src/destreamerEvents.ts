import { Errors } from './Types';

import colors from 'colors';

/**
 * This file contains global destreamer process events
 *
 * @note SIGINT event is overridden in downloadVideo function
 *
 * @note function is required for non-packaged destreamer, so we can't do better
 */
export function setProcessEvents() {
    process.on('unhandledRejection', (reason) => {
        console.error(colors.red('Unhandled error!\nTimeout or fatal error, please check your downloads and try again if necessary.\n'));
        console.error(colors.red(reason as string));
    });

    process.on('exit', (code) => {
        if (code == 0)
            return;
        else if (code in Errors)
            console.error(colors.bgRed(`\n\nError: ${Errors[code]} \n`));
        else
            console.error(colors.bgRed(`\n\nUnknown exit code ${code} \n`));
    });
}