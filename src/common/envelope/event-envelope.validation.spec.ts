import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { EventEnvelope } from './event-envelope.class';
import { createValidProperties } from './event-envelope.fixture';

describe('EventEnvelope', () => {
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
});
