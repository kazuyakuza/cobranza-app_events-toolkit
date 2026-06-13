import { nowIso } from './date.utils';

describe('date.utils', () => {
  describe('nowIso', () => {
    it('returns an ISO 8601 string in UTC format', () => {
      const iso = nowIso();
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns a time close to current time', () => {
      const before = Date.now();
      const iso = nowIso();
      const parsed = new Date(iso).getTime();
      const after = Date.now();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });

    it('always includes milliseconds', () => {
      const iso = nowIso();
      expect(iso).toContain('.');
      expect(iso.endsWith('Z')).toBe(true);
      const msPart = iso.split('.')[1].replace('Z', '');
      expect(msPart).toHaveLength(3);
    });
  });
});
