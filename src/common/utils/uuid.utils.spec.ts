import { generateUuidV7, generateEventId } from './uuid.utils';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid.utils', () => {
  describe('generateUuidV7', () => {
    it('returns a string matching UUIDv7 format', () => {
      const id = generateUuidV7();
      expect(id).toMatch(UUID_V7_REGEX);
    });

    it('generates unique values on successive calls', () => {
      const ids = Array.from({ length: 100 }, () => generateUuidV7());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    it('generates monotonically increasing UUIDs by timestamp', () => {
      const id1 = generateUuidV7();
      const id2 = generateUuidV7();
      expect(id1.substring(0, 12) <= id2.substring(0, 12)).toBe(true);
    });
  });

  describe('generateEventId', () => {
    it('returns a string starting with evt_', () => {
      const id = generateEventId();
      expect(id.startsWith('evt_')).toBe(true);
    });

    it('contains a valid UUIDv7 after the prefix', () => {
      const id = generateEventId();
      const uuidPart = id.slice(4);
      expect(uuidPart).toMatch(UUID_V7_REGEX);
    });

    it('generates unique values on successive calls', () => {
      const ids = Array.from({ length: 100 }, () => generateEventId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });
});
