import 'reflect-metadata';
import { ManifestContributorMerger } from './manifest-contributor.merger';
import {
  createMockManifest,
  createConsumeEntry,
  createProduceEntry,
  createContributor,
} from './manifest-contributor.merger.fixtures';

describe('ManifestContributorMerger — deduplication', () => {
  const merger = new ManifestContributorMerger();

  describe('M4: deduplicates produces by subject — baseline wins', () => {
    it('skips contributor produce entry when subject already exists in baseline', () => {
      const baseline = createMockManifest({
        produces: [createProduceEntry({ subject: 'company.{companyId}.payment.v1', handler: 'baselineHandler' })],
      });
      const contributorProduce = createProduceEntry({
        subject: 'company.{companyId}.payment.v1',
        handler: 'contributorHandler',
      });
      const contributor = createContributor([], [contributorProduce]);
      const result = merger.merge(baseline, [contributor]);
      expect(result.produces).toHaveLength(1);
      expect(result.produces[0].handler).toBe('baselineHandler');
    });
  });

  describe('M5: deduplicates consumes by subject+type — baseline wins', () => {
    it('skips contributor consume entry when subject and type match baseline', () => {
      const baseline = createMockManifest({
        consumes: [createConsumeEntry({ subject: 'company.*.payment.v1', type: 'event', handler: 'baselineHandler' })],
      });
      const contributorConsume = createConsumeEntry({
        subject: 'company.*.payment.v1',
        type: 'event',
        handler: 'contributorHandler',
      });
      const contributor = createContributor([contributorConsume], []);
      const result = merger.merge(baseline, [contributor]);
      expect(result.consumes).toHaveLength(1);
      expect(result.consumes[0].handler).toBe('baselineHandler');
    });
  });

  describe('M6: same subject but different type in consumes — both kept', () => {
    it('keeps both entries when subject is same but type differs', () => {
      const baseline = createMockManifest({
        consumes: [createConsumeEntry({ subject: 'company.*.payment.v1', type: 'event', handler: 'eventHandler' })],
      });
      const contributorConsume = createConsumeEntry({
        subject: 'company.*.payment.v1',
        type: 'request-reply',
        handler: 'replyHandler',
      });
      const contributor = createContributor([contributorConsume], []);
      const result = merger.merge(baseline, [contributor]);
      expect(result.consumes).toHaveLength(2);
      expect(result.consumes[0].type).toBe('event');
      expect(result.consumes[1].type).toBe('request-reply');
    });
  });

  describe('M7: multiple contributors, earlier wins on collision', () => {
    it('first contributor entry wins when two contributors provide same consume key', () => {
      const baseline = createMockManifest();
      const firstConsume = createConsumeEntry({ subject: 'company.*.collision.v1', handler: 'firstHandler' });
      const secondConsume = createConsumeEntry({ subject: 'company.*.collision.v1', handler: 'secondHandler' });
      const first = createContributor([firstConsume], []);
      const second = createContributor([secondConsume], []);
      const result = merger.merge(baseline, [first, second]);
      expect(result.consumes).toHaveLength(1);
      expect(result.consumes[0].handler).toBe('firstHandler');
    });

    it('first contributor produce entry wins on subject collision', () => {
      const baseline = createMockManifest();
      const firstProduce = createProduceEntry({ subject: 'company.{companyId}.collision.v1', handler: 'firstEmitter' });
      const secondProduce = createProduceEntry({
        subject: 'company.{companyId}.collision.v1',
        handler: 'secondEmitter',
      });
      const first = createContributor([], [firstProduce]);
      const second = createContributor([], [secondProduce]);
      const result = merger.merge(baseline, [first, second]);
      expect(result.produces).toHaveLength(1);
      expect(result.produces[0].handler).toBe('firstEmitter');
    });
  });
});
