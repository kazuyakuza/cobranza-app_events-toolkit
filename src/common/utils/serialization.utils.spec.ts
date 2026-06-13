import { encodeEvent, decodeEvent } from './serialization.utils';

describe('serialization utils', () => {
  describe('encodeEvent', () => {
    it('should encode a plain object to UTF-8 JSON bytes', () => {
      const payload = { id: 'evt-123', type: 'order.created' };
      const encoded = encodeEvent(payload);

      expect(encoded).toBeInstanceOf(Uint8Array);
      const decoded = JSON.parse(new TextDecoder().decode(encoded));
      expect(decoded).toEqual(payload);
    });

    it('should encode null to JSON null bytes', () => {
      const encoded = encodeEvent(null);
      expect(JSON.parse(new TextDecoder().decode(encoded))).toBeNull();
    });
  });

  describe('decodeEvent', () => {
    it('should decode UTF-8 JSON bytes into a typed object', () => {
      const payload = { data: { verified: true }, id: 'evt-456' };
      const raw = new TextEncoder().encode(JSON.stringify(payload));

      const result = decodeEvent<typeof payload>(raw);
      expect(result).toEqual(payload);
    });

    it('should preserve numeric and boolean types', () => {
      const payload = { count: 42, active: false };
      const raw = new TextEncoder().encode(JSON.stringify(payload));

      const result = decodeEvent<typeof payload>(raw);
      expect(result.count).toBe(42);
      expect(result.active).toBe(false);
    });
  });
});
