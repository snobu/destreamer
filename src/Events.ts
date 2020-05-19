import { Error, ERROR_CODE } from './Errors';

import colors from 'colors';

/**
 * This file contains global destreamer process events
 *
 * @note SIGINT event is overridden in downloadVideo function
 *
 * @note function is required for non-packaged destreamer, so we can't do better
 */
export function setProcessEvents() {
    // set exit event first so that we can always print cute errors
    process.on('exit', (code) => {
        if (code == 0) {
            return;
        }

        const msg = code in Error ? `\n\n${Error[code]} \n` : `\n\nUnknown error: exit code ${code} \n`;

        console.error(colors.bgRed(msg));
    });

    process.on('unhandledRejection', (reason) => {
        console.error(colors.red(reason as string));
        process.exit(ERROR_CODE.UNHANDLED_ERROR);
    });
}