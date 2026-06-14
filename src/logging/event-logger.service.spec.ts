import * as winston from 'winston';
import { EventLoggerService } from './event-logger.service';

const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  })),
  format: {
    json: jest.fn(() => 'mocked-json-format'),
    timestamp: jest.fn(() => 'mocked-timestamp-format'),
    combine: jest.fn((...formats: unknown[]) => formats),
  },
  transports: { Console: jest.fn() },
}));

describe('EventLoggerService', () => {
  const eventContext = {
    eventId: 'evt_test-123',
    eventType: 'payment.proof.uploaded',
    subject: 'company.abc.payment.proof.uploaded.v1',
    correlationId: 'corr-456',
    traceId: 'trace-789',
  };

  const errorContext = {
    ...eventContext,
    error: 'Validation failed',
    stack: 'Error: Validation failed\n    at ...',
  };

  const outboxContext = {
    eventId: 'evt_test-456',
    eventType: 'payment.proof.uploaded',
    subject: 'company.abc.payment.proof.uploaded.v1',
    attempt: 0,
    correlationId: 'corr-456',
    traceId: 'trace-789',
  };

  const outboxErrorContext = {
    ...outboxContext,
    error: 'NATS connection lost',
    stack: 'Error: NATS connection lost\n    at ...',
  };

  beforeEach(() => {
    mockInfo.mockClear();
    mockWarn.mockClear();
    mockError.mockClear();
  });

  describe('constructor', () => {
    it('creates a Winston logger with default Console transport', () => {
      new EventLoggerService();
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          transports: expect.any(Array),
        }),
      );
    });

    it('creates a Winston logger with custom transports', () => {
      const customTransport = new winston.transports.Console();
      new EventLoggerService({ transports: [customTransport], level: 'debug' });
      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          transports: [customTransport],
        }),
      );
    });
  });

  describe('logEventEmitted', () => {
    it('logs at info level with event context', () => {
      const service = new EventLoggerService();
      service.logEventEmitted(eventContext);
      expect(mockInfo).toHaveBeenCalledWith('Event emitted', eventContext);
    });
  });

  describe('logEventConsumed', () => {
    it('logs at info level with event context', () => {
      const service = new EventLoggerService();
      service.logEventConsumed(eventContext);
      expect(mockInfo).toHaveBeenCalledWith('Event consumed', eventContext);
    });
  });

  describe('logEventError', () => {
    it('logs at error level with error context including stack', () => {
      const service = new EventLoggerService();
      service.logEventError(errorContext);
      expect(mockError).toHaveBeenCalledWith('Event processing error', errorContext);
    });
  });

  describe('logEventDlq', () => {
    it('logs at warn level with error context', () => {
      const service = new EventLoggerService();
      service.logEventDlq(errorContext);
      expect(mockWarn).toHaveBeenCalledWith('Event routed to DLQ', errorContext);
    });
  });

  describe('logOutboxSaved', () => {
    it('logs at info level with outbox context', () => {
      const service = new EventLoggerService();
      service.logOutboxSaved(outboxContext);
      expect(mockInfo).toHaveBeenCalledWith('Outbox event saved', outboxContext);
    });
  });

  describe('logOutboxProcessed', () => {
    it('logs at info level with outbox context', () => {
      const service = new EventLoggerService();
      service.logOutboxProcessed(outboxContext);
      expect(mockInfo).toHaveBeenCalledWith('Outbox event processed', outboxContext);
    });
  });

  describe('logOutboxFailed', () => {
    it('logs at warn level with outbox error context', () => {
      const service = new EventLoggerService();
      service.logOutboxFailed(outboxErrorContext);
      expect(mockWarn).toHaveBeenCalledWith('Outbox event processing failed', outboxErrorContext);
    });
  });

  describe('logOutboxDlq', () => {
    it('logs at warn level with outbox error context', () => {
      const service = new EventLoggerService();
      service.logOutboxDlq(outboxErrorContext);
      expect(mockWarn).toHaveBeenCalledWith('Outbox event routed to DLQ', outboxErrorContext);
    });
  });
});
