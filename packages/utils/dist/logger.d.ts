/** Log level enum */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4
}
/** Logger interface */
export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    child(name: string): Logger;
}
/** Logger configuration */
export interface LoggerConfig {
    level: LogLevel;
    prefix?: string;
    output?: (level: LogLevel, message: string, args: unknown[]) => void;
}
/** Create a logger instance */
export declare function createLogger(config?: Partial<LoggerConfig>): Logger;
//# sourceMappingURL=logger.d.ts.map