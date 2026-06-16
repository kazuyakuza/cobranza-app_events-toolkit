import { Injectable } from '@nestjs/common';
import {
  EventLogContext,
  EventErrorLogContext,
  OutboxLogContext,
  OutboxErrorLogContext,
} from '../logging/event-logger.service';

export type LogMethod =
  | 'logEventEmitted'
  | 'logEventConsumed'
  | 'logEventError'
  | 'logEventDlq'
  | 'logOutboxSaved'
  | 'logOutboxProcessed'
  | 'logOutboxFailed'
  | 'logOutboxDlq';

export interface LogRecord {
  method: LogMethod;
  context: EventLogContext | EventErrorLogContext | OutboxLogContext | OutboxErrorLogContext;
}

@Injectable()
export class MockEventLoggerService {
  private readonly logs: LogRecord[] = [];

  logEventEmitted(context: EventLogContext): void {
    this.recordLog('logEventEmitted', context);
  }

  logEventConsumed(context: EventLogContext): void {
    this.recordLog('logEventConsumed', context);
  }

  logEventError(context: EventErrorLogContext): void {
    this.recordLog('logEventError', context);
  }

  logEventDlq(context: EventErrorLogContext): void {
    this.recordLog('logEventDlq', context);
  }

  logOutboxSaved(context: OutboxLogContext): void {
    this.recordLog('logOutboxSaved', context);
  }

  logOutboxProcessed(context: OutboxLogContext): void {
    this.recordLog('logOutboxProcessed', context);
  }

  logOutboxFailed(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxFailed', context);
  }

  logOutboxDlq(context: OutboxErrorLogContext): void {
    this.recordLog('logOutboxDlq', context);
  }

  getLogs(): ReadonlyArray<LogRecord> {
    return this.logs;
  }

  clear(): void {
    this.logs.length = 0;
  }

  private recordLog(method: LogMethod, context: LogRecord['context']): void {
    this.logs.push({ method, context });
  }
}
