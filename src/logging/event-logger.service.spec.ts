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
  format: { json: jest.fn(() => 'mocked-json-format') },
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
});
