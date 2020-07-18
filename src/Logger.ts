import colors from 'colors';
import winston from 'winston';


export const logger: winston.Logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.errors({ stack: true }),
                winston.format.timestamp({ format: 'YYYY-MM-DD hh:mm:ss' }),
                winston.format.printf(
                    (item: winston.Logform.TransformableInfo) => customPrint(item)
                )
            )
        })
    ]
});


function customPrint (info: winston.Logform.TransformableInfo): string {
    if (info.level === 'error') {
        if (info.fatal) {
            return colors.red('\n\n[FATAL ERROR] ') + (info.stack ?? info.message);
        }

        return colors.red('\n[ERROR] ') + (info.stack ?? info.message) + '\n';
    }
    else if (info.level === 'warn') {
        return colors.yellow('\n[WARNING] ') + info.message;
    }
    else if (info.level === 'info') {
        return info.message;
    }
    else if (info.level === 'verbose') {
        return colors.cyan('\n[VERBOSE] ') + info.message;
    }

    return `${info.level}: ${info.message} - ${info.timestamp}`;
}
