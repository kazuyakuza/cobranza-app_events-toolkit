import { Injectable } from '@nestjs/common';
import {
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from '../logging/event-logger.service';

/** Union of all log method names available on `MockEventLoggerService`. */
export type LogMethod =
  | 'logEventEmitted'
  | 'logEventConsumed'
  | 'logEventError'
  | 'logEventDlq'
  | 'logOutboxSaved'
  | 'logOutboxProcessed'
  | 'logOutboxFailed'
  | 'logOutboxDlq';

/** A single recorded log call captured by `MockEventLoggerService`. */
export interface LogRecord {
  /** The log method that was called. */
  method: LogMethod;
  /** The context object passed to the log method. */
  context: EventLogContext | EventErrorLogContext | OutboxLogContext | OutboxErrorLogContext;
}

/**
 * In-memory mock for `EventLoggerService`.
 *
 * Records every log call so tests can assert on logging behavior
 * without producing real log output.
 */
@Injectable()
export class MockEventLoggerService {
  private readonly logs: LogRecord[] = [];

  /** Records an event-emitted log entry. */
  logEventEmitted(context: EventLogContext): void {
    this.recordLog('logEventEmitted', context);
  }

  /** Records an event-consumed log entry. */
  logEventConsumed(context: EventLogContext): void {
    this.recordLog('logEventConsumed', context);
  }

  /** Records an event-error log entry. */
  logEventError(context: EventErrorLogContext): void {
    this.recordLog('logEventError', context);
  }

  /** Records an event-DLQ log entry. */
  logEventDlq(context: EventErrorLogContext): void {
    this.recordLog('logEventDlq', context);
  }

  /** Records an outbox-saved log entry. */
  logOutboxSaved(context: OutboxLogContext): void {
    this.recordLog('logOutboxSaved', context);
  }

  /** Records an outbox-processed log entry. */
  logOutboxProcessed(context: OutboxLogContext): void {
    this.recordLog('logOutboxProcessed', context);
  }

  /** Records an outbox-failed log entry. */
  logOutboxFailed(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxFailed', context);
  }

  /** Records an outbox-DLQ log entry. */
  logOutboxDlq(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxDlq', context);
  }

  /** Returns all recorded log entries. */
  getLogs(): ReadonlyArray<LogRecord> {
    return this.logs;
  }

  /** Resets all recorded log entries. */
  clear(): void {
    this.logs.length = 0;
  }

  private recordLog(method: LogMethod, context: LogRecord['context']): void {
    this.logs.push({ method, context });
  }
}
