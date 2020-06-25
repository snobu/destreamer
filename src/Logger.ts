import winston from 'winston';
import colors from 'colors';

export const logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.timestamp({ format: 'DD-MM-YYYY hh:mm:ss' }),
                // winston.format.simple()
                winston.format.printf(item => customPrint(item)))
        })
    ]
});


export function customPrint (info: winston.Logform.TransformableInfo): string {
    if (info.level === 'error') {
        if (info.fatal) {
            return colors.red('\n\n[FATAL ERROR] ') + (info.stack ?? info.message);
        }

        return colors.red('[ERROR] ') + (info.stack ?? info.message);
    }
    else if (info.level === 'warn') {
        return colors.yellow('[WARNING] ') + info.message;
    }
    else if (info.level === 'info') {
        return info.message;
    }
    else if (info.level === 'verbose') {
        return colors.cyan('[VERBOSE] ') + info.message;
    }

    return `${info.level}: ${info.message} - ${info.timestamp}`;
}
