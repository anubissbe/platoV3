/**
 * Enterprise Structured Logging System for Plato TUI
 * Provides correlation IDs, structured logging, and observability integration
 */

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  command?: string;
  traceId?: string;
  spanId?: string;
  timestamp: string;
  environment: string;
  version: string;
  hostname: string;
  pid: number;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: LogContext;
  data?: any;
  error?: Error;
  duration?: number;
  metadata?: Record<string, any>;
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface LogDestination {
  write(entry: LogEntry): void | Promise<void>;
  close?(): void | Promise<void>;
}

// Console destination with structured output
export class ConsoleDestination implements LogDestination {
  private readonly colors = {
    debug: '\x1b[36m',
    info: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
    fatal: '\x1b[35m',
    reset: '\x1b[0m'
  };

  write(entry: LogEntry): void {
    const color = this.colors[entry.level] || this.colors.reset;
    const timestamp = new Date(entry.context.timestamp).toISOString();

    const logLine = {
      timestamp,
      level: entry.level,
      message: entry.message,
      correlationId: entry.context.correlationId,
      ...(entry.context.userId && { userId: entry.context.userId }),
      ...(entry.context.sessionId && { sessionId: entry.context.sessionId }),
      ...(entry.context.command && { command: entry.context.command }),
      ...(entry.duration && { duration: `${entry.duration}ms` }),
      ...(entry.data && { data: entry.data }),
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        }
      }),
      ...(entry.metadata && { metadata: entry.metadata })
    };

    console.log(`${color}[${entry.level.toUpperCase()}]${this.colors.reset}`, JSON.stringify(logLine, null, 2));
  }
}

// File destination with rotation
export class FileDestination implements LogDestination {
  constructor(
    private readonly filePath: string,
    private readonly maxSize: number = 100 * 1024 * 1024, // 100MB
    private readonly maxFiles: number = 10
  ) {}

  async write(entry: LogEntry): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const logLine = JSON.stringify(entry) + '\n';

    try {
      // Check file size and rotate if necessary
      const stats = await fs.stat(this.filePath).catch(() => null);
      if (stats && stats.size >= this.maxSize) {
        await this.rotateFile();
      }

      await fs.appendFile(this.filePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private async rotateFile(): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath, path.extname(this.filePath));
    const ext = path.extname(this.filePath);

    // Rotate existing files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldFile = path.join(dir, `${base}.${i}${ext}`);
      const newFile = path.join(dir, `${base}.${i + 1}${ext}`);

      try {
        await fs.rename(oldFile, newFile);
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    // Move current file to .1
    const firstRotated = path.join(dir, `${base}.1${ext}`);
    try {
      await fs.rename(this.filePath, firstRotated);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }
}

// ElasticSearch destination
export class ElasticSearchDestination implements LogDestination {
  constructor(
    private readonly endpoint: string,
    private readonly index: string,
    private readonly apiKey?: string
  ) {}

  async write(entry: LogEntry): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (this.apiKey) {
        headers['Authorization'] = `ApiKey ${this.apiKey}`;
      }

      const response = await fetch(`${this.endpoint}/${this.index}/_doc`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          '@timestamp': entry.context.timestamp,
          level: entry.level,
          message: entry.message,
          correlation_id: entry.context.correlationId,
          user_id: entry.context.userId,
          session_id: entry.context.sessionId,
          command: entry.context.command,
          trace_id: entry.context.traceId,
          span_id: entry.context.spanId,
          environment: entry.context.environment,
          version: entry.context.version,
          hostname: entry.context.hostname,
          pid: entry.context.pid,
          duration: entry.duration,
          data: entry.data,
          error: entry.error && {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack
          },
          metadata: entry.metadata
        })
      });

      if (!response.ok) {
        throw new Error(`ElasticSearch write failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to write to ElasticSearch:', error);
    }
  }
}

// Context storage for correlation IDs
const contextStorage = new AsyncLocalStorage<Partial<LogContext>>();

export class StructuredLogger {
  private readonly destinations: LogDestination[] = [];
  private readonly baseContext: Partial<LogContext>;

  constructor(baseContext: Partial<LogContext> = {}) {
    this.baseContext = {
      environment: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '0.1.0',
      hostname: process.env.HOSTNAME || 'localhost',
      pid: process.pid,
      ...baseContext
    };
  }

  addDestination(destination: LogDestination): this {
    this.destinations.push(destination);
    return this;
  }

  removeDestination(destination: LogDestination): this {
    const index = this.destinations.indexOf(destination);
    if (index > -1) {
      this.destinations.splice(index, 1);
    }
    return this;
  }

  // Context management
  withContext<T>(context: Partial<LogContext>, fn: () => T): T {
    const currentContext = contextStorage.getStore() || {};
    const mergedContext = { ...currentContext, ...context };
    return contextStorage.run(mergedContext, fn);
  }

  withCorrelationId<T>(fn: () => T): T {
    return this.withContext({ correlationId: randomUUID() }, fn);
  }

  withUser<T>(userId: string, fn: () => T): T {
    return this.withContext({ userId }, fn);
  }

  withSession<T>(sessionId: string, fn: () => T): T {
    return this.withContext({ sessionId }, fn);
  }

  withCommand<T>(command: string, fn: () => T): T {
    return this.withContext({ command }, fn);
  }

  // Logging methods
  debug(message: string, data?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, data, metadata);
  }

  info(message: string, data?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, data, metadata);
  }

  warn(message: string, data?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, data, metadata);
  }

  error(message: string, error?: Error, data?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, data, metadata, error);
  }

  fatal(message: string, error?: Error, data?: any, metadata?: Record<string, any>): void {
    this.log(LogLevel.FATAL, message, data, metadata, error);
  }

  // Performance logging
  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const correlationId = randomUUID();

    this.info(`Starting ${name}`, { name }, { correlationId });

    try {
      const result = await this.withCorrelationId(fn);
      const duration = Date.now() - start;

      this.info(`Completed ${name}`, { name, duration }, { correlationId });

      return result;
    } catch (error) {
      const duration = Date.now() - start;

      this.error(
        `Failed ${name}`,
        error as Error,
        { name, duration },
        { correlationId }
      );

      throw error;
    }
  }

  timeSync<T>(name: string, fn: () => T): T {
    const start = Date.now();
    const correlationId = randomUUID();

    this.info(`Starting ${name}`, { name }, { correlationId });

    try {
      const result = this.withCorrelationId(fn);
      const duration = Date.now() - start;

      this.info(`Completed ${name}`, { name, duration }, { correlationId });

      return result;
    } catch (error) {
      const duration = Date.now() - start;

      this.error(
        `Failed ${name}`,
        error as Error,
        { name, duration },
        { correlationId }
      );

      throw error;
    }
  }

  private log(
    level: LogLevel,
    message: string,
    data?: any,
    metadata?: Record<string, any>,
    error?: Error,
    duration?: number
  ): void {
    const contextData = contextStorage.getStore() || {};

    const context: LogContext = {
      correlationId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...this.baseContext,
      ...contextData
    } as LogContext;

    const entry: LogEntry = {
      level,
      message,
      context,
      ...(data && { data }),
      ...(error && { error }),
      ...(duration && { duration }),
      ...(metadata && { metadata })
    };

    // Write to all destinations
    this.destinations.forEach(destination => {
      try {
        const result = destination.write(entry);
        if (result instanceof Promise) {
          result.catch(err => console.error('Log destination failed:', err));
        }
      } catch (err) {
        console.error('Log destination failed:', err);
      }
    });
  }

  async close(): Promise<void> {
    await Promise.all(
      this.destinations.map(dest => {
        if (dest.close) {
          return dest.close();
        }
      })
    );
  }
}

// Default logger instance
export const logger = new StructuredLogger()
  .addDestination(new ConsoleDestination());

// Environment-specific setup
if (process.env.LOG_FILE) {
  logger.addDestination(new FileDestination(process.env.LOG_FILE));
}

if (process.env.ELASTICSEARCH_ENDPOINT) {
  logger.addDestination(new ElasticSearchDestination(
    process.env.ELASTICSEARCH_ENDPOINT,
    process.env.ELASTICSEARCH_INDEX || 'plato-logs',
    process.env.ELASTICSEARCH_API_KEY
  ));
}

export default logger;