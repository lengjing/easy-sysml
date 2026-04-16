/** Log level enum */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["SILENT"] = 4] = "SILENT";
})(LogLevel || (LogLevel = {}));
function defaultOutput(level, message, args) {
    switch (level) {
        case LogLevel.DEBUG:
            console.debug(message, ...args);
            break;
        case LogLevel.INFO:
            console.info(message, ...args);
            break;
        case LogLevel.WARN:
            console.warn(message, ...args);
            break;
        case LogLevel.ERROR:
            console.error(message, ...args);
            break;
    }
}
/** Create a logger instance */
export function createLogger(config = {}) {
    const level = config.level ?? LogLevel.INFO;
    const prefix = config.prefix;
    const output = config.output ?? defaultOutput;
    function formatMessage(message) {
        return prefix ? `[${prefix}] ${message}` : message;
    }
    function log(logLevel, message, args) {
        if (logLevel >= level) {
            output(logLevel, formatMessage(message), args);
        }
    }
    const logger = {
        debug(message, ...args) {
            log(LogLevel.DEBUG, message, args);
        },
        info(message, ...args) {
            log(LogLevel.INFO, message, args);
        },
        warn(message, ...args) {
            log(LogLevel.WARN, message, args);
        },
        error(message, ...args) {
            log(LogLevel.ERROR, message, args);
        },
        child(name) {
            const childPrefix = prefix ? `${prefix}:${name}` : name;
            return createLogger({ level, prefix: childPrefix, output });
        },
    };
    return logger;
}
//# sourceMappingURL=logger.js.map