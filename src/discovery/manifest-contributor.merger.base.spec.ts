import 'reflect-metadata';
import { ManifestContributorMerger } from './manifest-contributor.merger';
import {
  createMockManifest,
  createConsumeEntry,
  createProduceEntry,
  createContributor,
} from './manifest-contributor.merger.fixtures';

describe('ManifestContributorMerger — base merge behavior', () => {
  const merger = new ManifestContributorMerger();

  describe('M1: merges empty contributor arrays with baseline (no change)', () => {
    it('returns the baseline manifest unchanged when contributors array is empty', () => {
      const baseline = createMockManifest({
        consumes: [createConsumeEntry({ subject: 'company.*.existing.v1' })],
        produces: [createProduceEntry({ subject: 'company.{companyId}.existing.v1' })],
      });
      const result = merger.merge(baseline, []);
      expect(result.consumes).toEqual(baseline.consumes);
      expect(result.produces).toEqual(baseline.produces);
    });

    it('returns the baseline manifest unchanged when contributors return empty arrays', () => {
      const baseline = createMockManifest({
        consumes: [createConsumeEntry({ subject: 'company.*.existing.v1' })],
        produces: [createProduceEntry({ subject: 'company.{companyId}.existing.v1' })],
      });
      const contributor = createContributor([], []);
      const result = merger.merge(baseline, [contributor]);
      expect(result.consumes).toEqual(baseline.consumes);
      expect(result.produces).toEqual(baseline.produces);
    });
  });

  describe('M2: appends contributor consumes to baseline', () => {
    it('adds new consume entries from contributors', () => {
      const baseline = createMockManifest({
        consumes: [createConsumeEntry({ subject: 'company.*.existing.v1' })],
      });
      const contributorConsume = createConsumeEntry({ subject: 'company.*.dynamic.v1', handler: 'dynamicHandler' });
      const contributor = createContributor([contributorConsume], []);
      const result = merger.merge(baseline, [contributor]);
      expect(result.consumes).toHaveLength(2);
      expect(result.consumes[1].subject).toBe('company.*.dynamic.v1');
      expect(result.consumes[1].handler).toBe('dynamicHandler');
    });
  });

  describe('M3: appends contributor produces to baseline', () => {
    it('adds new produce entries from contributors', () => {
      const baseline = createMockManifest({
        produces: [createProduceEntry({ subject: 'company.{companyId}.existing.v1' })],
      });
      const contributorProduce = createProduceEntry({
        subject: 'company.{companyId}.dynamic.v1',
        handler: 'dynamicEmitter',
      });
      const contributor = createContributor([], [contributorProduce]);
      const result = merger.merge(baseline, [contributor]);
      expect(result.produces).toHaveLength(2);
      expect(result.produces[1].subject).toBe('company.{companyId}.dynamic.v1');
      expect(result.produces[1].handler).toBe('dynamicEmitter');
    });
  });

  describe('M8: does not mutate the input baseline manifest', () => {
    it('returns a new object without modifying the original baseline', () => {
      const originalConsumes = [createConsumeEntry({ subject: 'company.*.existing.v1' })];
      const originalProduces = [createProduceEntry({ subject: 'company.{companyId}.existing.v1' })];
      const baseline = createMockManifest({
        consumes: originalConsumes,
        produces: originalProduces,
      });
      const contributorConsume = createConsumeEntry({ subject: 'company.*.dynamic.v1' });
      const contributor = createContributor([contributorConsume], []);
      const result = merger.merge(baseline, [contributor]);
      expect(result).not.toBe(baseline);
      expect(baseline.consumes).toHaveLength(1);
      expect(baseline.consumes[0].subject).toBe('company.*.existing.v1');
      expect(result.consumes).toHaveLength(2);
    });
  });
});
