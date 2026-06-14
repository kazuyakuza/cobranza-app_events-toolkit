import {
  buildDlqSubject,
  parseEnvelope,
  extractErrorMessage,
  calculateBackoff,
  delay,
  buildDlqPayload,
  createDlqEnvelope,
} from './outbox.utils';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { ActorType } from '../common/envelope/actor-type.enum';
import { OutboxEntry } from './outbox.types';

function createTestEnvelope(): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    type: 'payment.proof.uploaded',
    version: '1.0.0',
    produced_at: '2026-01-15T10:30:00.000Z',
    producer: 'payment-service',
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    actor_type: ActorType.SYSTEM,
    actor_id: 'user-123',
    correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    data: { amount: 100 },
  });
}

function createTestEntry(overrides?: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: 'evt_01929390-7abc-7123-8def-0123456789ab',
    eventData: JSON.stringify(createTestEnvelope()),
    subject: 'company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1',
    metadata: null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: '2026-01-15T10:30:00.000Z',
    updatedAt: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

describe('outbox.utils', () => {
  describe('buildDlqSubject', () => {
    it('prefixes subject with dlq.', () => {
      expect(buildDlqSubject('company.abc.payment.proof.uploaded.v1')).toBe(
        'dlq.company.abc.payment.proof.uploaded.v1',
      );
    });

    it('works with any subject string', () => {
      expect(buildDlqSubject('test.subject')).toBe('dlq.test.subject');
    });
  });

  describe('parseEnvelope', () => {
    it('parses JSON eventData string to EventEnvelope object', () => {
      const entry = createTestEntry();
      const envelope = parseEnvelope(entry);
      expect(envelope.id).toBe('evt_01929390-7abc-7123-8def-0123456789ab');
      expect(envelope.type).toBe('payment.proof.uploaded');
    });

    it('preserves all fields after round-trip serialization', () => {
      const original = createTestEnvelope();
      const entry = createTestEntry({ eventData: JSON.stringify(original) });
      const parsed = parseEnvelope(entry);
      expect(parsed.id).toBe(original.id);
      expect(parsed.type).toBe(original.type);
      expect(parsed.version).toBe(original.version);
      expect(parsed.company_id).toBe(original.company_id);
      expect(parsed.producer).toBe(original.producer);
    });
  });

  describe('extractErrorMessage', () => {
    it('returns Error.message for Error instance', () => {
      const error = new Error('something failed');
      expect(extractErrorMessage(error)).toBe('something failed');
    });

    it('returns String(value) for non-Error values', () => {
      expect(extractErrorMessage('plain string')).toBe('plain string');
    });

    it('returns string for primitive values', () => {
      expect(extractErrorMessage(42)).toBe('42');
      expect(extractErrorMessage(true)).toBe('true');
    });
  });

  describe('calculateBackoff', () => {
    it('returns baseMs for attempt 1', () => {
      expect(calculateBackoff(1, 1000)).toBe(1000);
    });

    it('returns 2x baseMs for attempt 2', () => {
      expect(calculateBackoff(2, 1000)).toBe(2000);
    });

    it('returns 4x baseMs for attempt 3', () => {
      expect(calculateBackoff(3, 1000)).toBe(4000);
    });

    it('returns 8x baseMs for attempt 4 with base 2000', () => {
      expect(calculateBackoff(4, 2000)).toBe(16000);
    });
  });

  describe('delay', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns a Promise<void>', () => {
      const result = delay(100);
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves after specified time', async () => {
      const promise = delay(500);
      jest.advanceTimersByTime(500);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('buildDlqPayload', () => {
    it('builds payload with originalSubject and originalEvent', () => {
      const entry = createTestEntry();
      const payload = buildDlqPayload(entry, new Error('publish failed'));
      expect(payload.originalSubject).toBe(entry.subject);
      expect(payload.originalEvent).toEqual(JSON.parse(entry.eventData));
    });

    it('includes attempts count incremented by one', () => {
      const entry = createTestEntry({ attempts: 2 });
      const payload = buildDlqPayload(entry, new Error('fail'));
      expect(payload.attempts).toBe(3);
    });

    it('includes failedAt ISO timestamp', () => {
      const entry = createTestEntry();
      const payload = buildDlqPayload(entry, new Error('fail'));
      expect(typeof payload.failedAt).toBe('string');
      expect(new Date(payload.failedAt as string).toISOString()).toBe(payload.failedAt);
    });

    it('handles non-Error lastError gracefully', () => {
      const entry = createTestEntry();
      const payload = buildDlqPayload(entry, 'string error');
      expect(payload.error).toBeDefined();
      expect((payload.error as Record<string, unknown>).message).toBe('string error');
    });
  });

  describe('createDlqEnvelope', () => {
    it('creates EventEnvelope with properties from source envelope', () => {
      const source = createTestEnvelope();
      const dlqPayload = { originalSubject: 'test', attempts: 1 };
      const result = createDlqEnvelope(source, dlqPayload);
      expect(result.id).toBe(source.id);
      expect(result.type).toBe(source.type);
      expect(result.version).toBe(source.version);
      expect(result.producer).toBe(source.producer);
      expect(result.company_id).toBe(source.company_id);
    });

    it('sets data to dlqPayload', () => {
      const source = createTestEnvelope();
      const dlqPayload = { originalSubject: 'test.subject', attempts: 1 };
      const result = createDlqEnvelope(source, dlqPayload);
      expect(result.data).toBe(dlqPayload);
    });

    it('generates new produced_at timestamp', () => {
      const source = createTestEnvelope();
      const dlqPayload = { originalSubject: 'test' };
      const beforeTime = new Date(source.produced_at).getTime();
      const result = createDlqEnvelope(source, dlqPayload);
      const resultTime = new Date(result.produced_at).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(beforeTime);
    });
  });
});
