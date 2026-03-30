import { createWriteStream, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { WriteStream } from 'fs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_NUMS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  getLogPath(): string | undefined;
}

let currentLogger: Logger | null = null;

function makeLogger(runId: string, stream: WriteStream | null, minLevel: number): Logger {
  const write = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    const num = LEVEL_NUMS[level];
    if (num < minLevel) return;

    if (stream) {
      const entry: Record<string, unknown> = {
        level: num,
        levelName: level,
        time: new Date().toISOString(),
        runId,
        msg,
        ...data,
      };
      stream.write(JSON.stringify(entry) + '\n');
    }

    // Console output — preserve original formatting (no extra prefix for info)
    if (level === 'error') {
      console.error(msg);
    } else if (level === 'warn') {
      console.warn(msg);
    } else if (level === 'debug') {
      if (process.env.LOG_LEVEL === 'debug') console.log(msg);
    } else {
      console.log(msg);
    }
  };

  return {
    debug: (msg, data) => write('debug', msg, data),
    info: (msg, data) => write('info', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    error: (msg, data) => write('error', msg, data),
    getLogPath: () => stream ? (stream.path as string) : undefined,
  };
}

export function initLogger(runId: string, logDir = './logs'): Logger {
  const absLogDir = resolve(process.cwd(), logDir);
  mkdirSync(absLogDir, { recursive: true });
  const logPath = resolve(absLogDir, `run-${runId}.log`);
  const stream = createWriteStream(logPath, { flags: 'a' });

  const configuredLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';
  const minLevel = LEVEL_NUMS[configuredLevel] ?? LEVEL_NUMS.info;

  const logger = makeLogger(runId, stream, minLevel);
  currentLogger = logger;
  return logger;
}

export function getLogger(): Logger {
  if (currentLogger) return currentLogger;

  // Fallback: console-only logger (no file) when loop hasn't initialized one
  const configuredLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';
  const minLevel = LEVEL_NUMS[configuredLevel] ?? LEVEL_NUMS.info;
  return makeLogger('fallback', null, minLevel);
}
