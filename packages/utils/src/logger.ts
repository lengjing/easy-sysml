/** Log level enum */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
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

function defaultOutput(level: LogLevel, message: string, args: unknown[]): void {
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
export function createLogger(config: Partial<LoggerConfig> = {}): Logger {
  const level = config.level ?? LogLevel.INFO;
  const prefix = config.prefix;
  const output = config.output ?? defaultOutput;

  function formatMessage(message: string): string {
    return prefix ? `[${prefix}] ${message}` : message;
  }

  function log(logLevel: LogLevel, message: string, args: unknown[]): void {
    if (logLevel >= level) {
      output(logLevel, formatMessage(message), args);
    }
  }

  const logger: Logger = {
    debug(message: string, ...args: unknown[]): void {
      log(LogLevel.DEBUG, message, args);
    },
    info(message: string, ...args: unknown[]): void {
      log(LogLevel.INFO, message, args);
    },
    warn(message: string, ...args: unknown[]): void {
      log(LogLevel.WARN, message, args);
    },
    error(message: string, ...args: unknown[]): void {
      log(LogLevel.ERROR, message, args);
    },
    child(name: string): Logger {
      const childPrefix = prefix ? `${prefix}:${name}` : name;
      return createLogger({ level, prefix: childPrefix, output });
    },
  };

  return logger;
}
