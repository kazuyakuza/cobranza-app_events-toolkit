import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';
import { createValidProperties } from './event-envelope.fixture';

describe('EventEnvelope', () => {
  describe('actor_type field validation', () => {
    it('accepts ActorType.SYSTEM', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.SYSTEM,
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_type')).toHaveLength(0);
    });

    it('accepts ActorType.CLIENT', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: ActorType.CLIENT,
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_type')).toHaveLength(0);
    });

    it('rejects nonexistent string value', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: 'nonexistent',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_type').length).toBeGreaterThan(0);
    });

    it('rejects non-enum value', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_type: 999,
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_type').length).toBeGreaterThan(0);
    });
  });

  describe('actor_id field validation', () => {
    it('accepts valid actor_id string', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_id')).toHaveLength(0);
    });

    it('rejects empty string actor_id', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        actor_id: '',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'actor_id').length).toBeGreaterThan(0);
    });
  });

  describe('correlation_id field validation', () => {
    it('accepts valid UUIDv4', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'correlation_id')).toHaveLength(0);
    });

    it('rejects non-UUID string', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        correlation_id: 'not-a-uuid',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'correlation_id').length).toBeGreaterThan(0);
    });
  });

  describe('causation_id field (optional)', () => {
    it('accepts undefined causation_id', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'causation_id')).toHaveLength(0);
    });

    it('accepts valid UUIDv4 causation_id', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        causation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'causation_id')).toHaveLength(0);
    });

    it('rejects non-UUID causation_id when present', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        causation_id: 'not-a-uuid',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'causation_id').length).toBeGreaterThan(0);
    });
  });

  describe('trace_id field (optional)', () => {
    it('accepts undefined trace_id', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'trace_id')).toHaveLength(0);
    });

    it('accepts valid string trace_id', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        trace_id: 'trace-abc-123',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'trace_id')).toHaveLength(0);
    });
  });

  describe('reply_to field (optional)', () => {
    it('accepts undefined reply_to', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'reply_to')).toHaveLength(0);
    });

    it('accepts valid string reply_to', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        reply_to: 'payment.response.queue',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'reply_to')).toHaveLength(0);
    });
  });

  describe('data field validation', () => {
    it('accepts valid object data', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'data')).toHaveLength(0);
    });

    it('accepts empty object data', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        data: {},
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'data')).toHaveLength(0);
    });

    it('rejects non-object string data', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        data: 'not-an-object',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'data').length).toBeGreaterThan(0);
    });
  });
});
