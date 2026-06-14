import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { ActorType } from './actor-type.enum';

function createValidProperties(): Partial<EventEnvelope> {
  return {
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
  };
}

describe('EventEnvelope', () => {
  describe('constructor', () => {
    it('creates instance with no properties (all fields undefined)', () => {
      const envelope = new EventEnvelope();
      expect(envelope.id).toBeUndefined();
      expect(envelope.type).toBeUndefined();
    });

    it('creates instance with partial properties via constructor', () => {
      const envelope = new EventEnvelope({ id: 'evt_test', type: 'test.event' });
      expect(envelope.id).toBe('evt_test');
      expect(envelope.type).toBe('test.event');
    });

    it('assigns all provided properties correctly', () => {
      const props = createValidProperties();
      const envelope = new EventEnvelope(props);
      expect(envelope.id).toBe(props.id);
      expect(envelope.type).toBe(props.type);
      expect(envelope.version).toBe(props.version);
      expect(envelope.produced_at).toBe(props.produced_at);
      expect(envelope.producer).toBe(props.producer);
      expect(envelope.company_id).toBe(props.company_id);
      expect(envelope.actor_type).toBe(props.actor_type);
      expect(envelope.actor_id).toBe(props.actor_id);
      expect(envelope.correlation_id).toBe(props.correlation_id);
      expect(envelope.data).toEqual(props.data);
    });
  });

  describe('id field validation', () => {
    it('accepts valid id with evt_ prefix and UUIDv7 format', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      const idErrors = errors.filter((e) => e.property === 'id');
      expect(idErrors).toHaveLength(0);
    });

    it('rejects id missing evt_ prefix', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        id: '01929390-7abc-7123-8def-0123456789ab',
      });
      const errors = validateSync(envelope);
      const idErrors = errors.filter((e) => e.property === 'id');
      expect(idErrors.length).toBeGreaterThan(0);
    });

    it('rejects empty string id', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        id: '',
      });
      const errors = validateSync(envelope);
      const idErrors = errors.filter((e) => e.property === 'id');
      expect(idErrors.length).toBeGreaterThan(0);
    });

    it('rejects non-string id', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        id: 12345,
      });
      const errors = validateSync(envelope);
      const idErrors = errors.filter((e) => e.property === 'id');
      expect(idErrors.length).toBeGreaterThan(0);
    });
  });

  describe('type field validation', () => {
    it('accepts valid type string', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'type')).toHaveLength(0);
    });

    it('rejects empty string type', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        type: '',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'type').length).toBeGreaterThan(0);
    });

    it('rejects non-string type', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        type: 42,
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'type').length).toBeGreaterThan(0);
    });
  });

  describe('version field validation', () => {
    it('accepts valid version string', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'version')).toHaveLength(0);
    });

    it('rejects empty string version', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        version: '',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'version').length).toBeGreaterThan(0);
    });

    it('rejects non-string version', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        version: 1,
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'version').length).toBeGreaterThan(0);
    });
  });

  describe('produced_at field validation', () => {
    it('accepts valid ISO 8601 timestamp', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'produced_at')).toHaveLength(0);
    });

    it('rejects non-ISO string', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        produced_at: 'yesterday',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'produced_at').length).toBeGreaterThan(0);
    });

    it('rejects empty string', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        produced_at: '',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'produced_at').length).toBeGreaterThan(0);
    });
  });

  describe('producer field validation', () => {
    it('accepts valid producer string', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'producer')).toHaveLength(0);
    });

    it('rejects empty string producer', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        producer: '',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'producer').length).toBeGreaterThan(0);
    });
  });

  describe('company_id field validation', () => {
    it('accepts valid UUIDv4', () => {
      const envelope = plainToInstance(EventEnvelope, { ...createValidProperties() });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'company_id')).toHaveLength(0);
    });

    it('rejects non-UUID string', () => {
      const envelope = plainToInstance(EventEnvelope, {
        ...createValidProperties(),
        company_id: 'my-company',
      });
      const errors = validateSync(envelope);
      expect(errors.filter((e) => e.property === 'company_id').length).toBeGreaterThan(0);
    });
  });

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
