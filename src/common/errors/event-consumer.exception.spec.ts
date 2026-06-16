import { EventConsumerException } from './event-consumer.exception';

describe('EventConsumerException', () => {
  it('creates exception with required fields only', () => {
    const exception = new EventConsumerException({
      message: 'Test error',
      eventId: 'evt_123',
      eventType: 'payment.proof.uploaded',
    });

    expect(exception.message).toBe('Test error');
    expect(exception.name).toBe('EventConsumerException');
    expect(exception.eventId).toBe('evt_123');
    expect(exception.eventType).toBe('payment.proof.uploaded');
    expect(exception.correlationId).toBeUndefined();
    expect(exception.cause).toBeUndefined();
    expect(exception.dlqReason).toBeUndefined();
    expect(exception.originalSubject).toBeUndefined();
    expect(exception.retryCount).toBeUndefined();
  });

  it('creates exception with all optional fields', () => {
    const cause = new Error('root cause');
    const exception = new EventConsumerException({
      message: 'Business rule violation',
      eventId: 'evt_456',
      eventType: 'debt.schedule.generated',
      correlationId: 'corr_789',
      cause,
      dlqReason: 'Invalid schedule parameters',
      originalSubject: 'company.abc.debt.schedule.generated.v1',
      retryCount: 3,
    });

    expect(exception.message).toBe('Business rule violation');
    expect(exception.eventId).toBe('evt_456');
    expect(exception.eventType).toBe('debt.schedule.generated');
    expect(exception.correlationId).toBe('corr_789');
    expect(exception.cause).toBe(cause);
    expect(exception.dlqReason).toBe('Invalid schedule parameters');
    expect(exception.originalSubject).toBe('company.abc.debt.schedule.generated.v1');
    expect(exception.retryCount).toBe(3);
  });

  it('preserves stack trace when Error.captureStackTrace is available', () => {
    const exception = new EventConsumerException({
      message: 'Stack test',
      eventId: 'evt_stack',
      eventType: 'test.event',
    });
    expect(exception.stack).toBeDefined();
  });

  it('allows retryCount without dlqReason', () => {
    const exception = new EventConsumerException({
      message: 'Max retries exceeded',
      eventId: 'evt_retry',
      eventType: 'notification.sent',
      retryCount: 5,
    });
    expect(exception.retryCount).toBe(5);
    expect(exception.dlqReason).toBeUndefined();
  });
});
