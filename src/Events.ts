import { errors, ERROR_CODE } from './Errors';
import { logger } from './Logger';


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

        const msg = (code in errors) ? `${errors[code]} \n` : `Unknown error: exit code ${code} \n`;

        logger.error({ message: msg, fatal: true });
    });

    process.on('unhandledRejection', (reason) => {
        if (reason instanceof Error) {
            logger.error({ message: (reason as Error) });
            process.exit(ERROR_CODE.UNHANDLED_ERROR);
        }

        logger.error({ message: (reason as string) });
        process.exit(ERROR_CODE.UNHANDLED_ERROR);
    });
}
