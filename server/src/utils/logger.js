/**
 * Structured Logger
 * Provides consistent console output and can easily be extended to write to files.
 */
const LogLevel = {
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
    DEBUG: 'DEBUG',
    AUDIT: 'AUDIT'
};

function getTimestamp() {
    return new Date().toISOString();
}

function formatMessage(level, message, meta) {
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${getTimestamp()}] [${level}] ${message}${metaStr}`;
}

export const logger = {
    info: (message, meta = null) => console.log(`\x1b[36m${formatMessage(LogLevel.INFO, message, meta)}\x1b[0m`),
    warn: (message, meta = null) => console.warn(`\x1b[33m${formatMessage(LogLevel.WARN, message, meta)}\x1b[0m`),
    error: (message, meta = null) => console.error(`\x1b[31m${formatMessage(LogLevel.ERROR, message, meta)}\x1b[0m`),
    debug: (message, meta = null) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`\x1b[90m${formatMessage(LogLevel.DEBUG, message, meta)}\x1b[0m`);
        }
    },
    audit: (message, meta = null) => console.log(`\x1b[35m${formatMessage(LogLevel.AUDIT, message, meta)}\x1b[0m`)
};