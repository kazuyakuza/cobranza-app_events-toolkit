import { MockEventLoggerService, LogMethod } from './mock-event-logger.service';

describe('MockEventLoggerService', () => {
  let service: MockEventLoggerService;

  beforeEach(() => {
    service = new MockEventLoggerService();
  });

  it('logEventEmitted records a LogRecord with correct method name', () => {
    service.logEventEmitted({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject' });
    const logs = service.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].method).toBe('logEventEmitted');
  });

  it('logEventConsumed records a LogRecord', () => {
    service.logEventConsumed({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject' });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logEventConsumed');
  });

  it('logEventError records a LogRecord', () => {
    service.logEventError({
      eventId: 'evt_001',
      eventType: 'test.event',
      subject: 'test.subject',
      error: 'test error',
    });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logEventError');
  });

  it('logEventDlq records a LogRecord', () => {
    service.logEventDlq({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', error: 'test error' });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logEventDlq');
  });

  it('logOutboxSaved records a LogRecord', () => {
    service.logOutboxSaved({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', attempt: 0 });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logOutboxSaved');
  });

  it('logOutboxProcessed records a LogRecord', () => {
    service.logOutboxProcessed({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', attempt: 0 });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logOutboxProcessed');
  });

  it('logOutboxFailed records a LogRecord', () => {
    service.logOutboxFailed({
      eventId: 'evt_001',
      eventType: 'test.event',
      subject: 'test.subject',
      attempt: 0,
      error: 'fail',
    });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logOutboxFailed');
  });

  it('logOutboxDlq records a LogRecord', () => {
    service.logOutboxDlq({
      eventId: 'evt_001',
      eventType: 'test.event',
      subject: 'test.subject',
      attempt: 0,
      error: 'dlq',
    });
    expect(service.getLogs()).toHaveLength(1);
    expect(service.getLogs()[0].method).toBe('logOutboxDlq');
  });

  it('getLogs returns all recorded logs across multiple calls', () => {
    const methods: LogMethod[] = ['logEventEmitted', 'logEventConsumed', 'logOutboxSaved'];
    for (const method of methods) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any)[method]({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', attempt: 0 });
    }
    expect(service.getLogs()).toHaveLength(3);
  });

  it('clear removes all recorded logs', () => {
    service.logEventEmitted({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject' });
    service.clear();
    expect(service.getLogs()).toHaveLength(0);
  });

  it('all log methods execute without errors', () => {
    expect(() => {
      service.logEventEmitted({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject' });
      service.logEventConsumed({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject' });
      service.logEventError({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', error: 'err' });
      service.logEventDlq({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', error: 'err' });
      service.logOutboxSaved({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', attempt: 0 });
      service.logOutboxProcessed({ eventId: 'evt_001', eventType: 'test.event', subject: 'test.subject', attempt: 0 });
      service.logOutboxFailed({
        eventId: 'evt_001',
        eventType: 'test.event',
        subject: 'test.subject',
        attempt: 0,
        error: 'err',
      });
      service.logOutboxDlq({
        eventId: 'evt_001',
        eventType: 'test.event',
        subject: 'test.subject',
        attempt: 0,
        error: 'err',
      });
    }).not.toThrow();
  });
});
