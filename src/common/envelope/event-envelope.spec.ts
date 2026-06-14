import { EventEnvelope } from './event-envelope.class';
import { createValidProperties } from './event-envelope.fixture';

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
});
