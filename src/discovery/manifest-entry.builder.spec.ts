import 'reflect-metadata';
import { ManifestEntryBuilder } from './manifest-entry.builder';
import { OnEventMetadata } from '../consumer/decorators/on-event.decorator';
import { EmitEventMetadata } from '../producer/decorators/emit-event.decorator';
import { OnRequestReplyMetadata } from '../consumer/decorators/on-request-reply.decorator';

describe('ManifestEntryBuilder', () => {
  const builder = new ManifestEntryBuilder();
  const emptyPayloadExample = {};

  function buildOnEventMetadata(overrides: Partial<OnEventMetadata> = {}): OnEventMetadata {
    return {
      eventType: 'payment.proof.uploaded',
      version: '1',
      description: 'Handles uploaded payment proofs',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  function buildEmitEventMetadata(overrides: Partial<EmitEventMetadata> = {}): EmitEventMetadata {
    return {
      eventType: 'payment.proof.uploaded',
      version: '1',
      description: 'A payment proof was uploaded',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  function buildOnRequestReplyMetadata(overrides: Partial<OnRequestReplyMetadata> = {}): OnRequestReplyMetadata {
    return {
      eventType: 'credit.check.completed',
      description: 'Handles credit check completion responses',
      payloadExample: emptyPayloadExample,
      ...overrides,
    };
  }

  function setDesignParamTypes(prototype: object, methodName: string, types: unknown[]): void {
    Reflect.defineMetadata('design:paramtypes', types, prototype, methodName);
  }

  function setDesignReturnType(prototype: object, methodName: string, type: unknown): void {
    Reflect.defineMetadata('design:returntype', type, prototype, methodName);
  }

  describe('buildOnEventEntry', () => {
    it('should build a consume entry with wildcard subject and event type', () => {
      const metadata = buildOnEventMetadata();
      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});
      expect(entry.subject).toBe('company.*.payment.proof.uploaded.v1');
      expect(entry.type).toBe('event');
      expect(entry.handler).toBe('onProofUploaded');
      expect(entry.version).toBe('1');
      expect(entry.description).toBe('Handles uploaded payment proofs');
    });

    it('should propagate description and payloadExample without fallbacks', () => {
      const example = { proofId: 'proof-123', amount: 100 };
      const metadata = buildOnEventMetadata({
        description: 'Custom description',
        payloadExample: example,
      });
      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});
      expect(entry.description).toBe('Custom description');
      expect(entry.payloadExample).toEqual(example);
    });

    it('should default tags to empty array when omitted', () => {
      const metadata = buildOnEventMetadata({ tags: undefined });
      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});
      expect(entry.tags).toEqual([]);
    });

    it('should preserve provided tags', () => {
      const metadata = buildOnEventMetadata({ tags: ['payment', 'proof'] });
      const entry = builder.buildOnEventEntry(metadata, 'onProofUploaded', {});
      expect(entry.tags).toEqual(['payment', 'proof']);
    });
  });

  describe('buildOnRequestReplyEntry', () => {
    it('should build a consume entry with required fields and defaults', () => {
      const metadata = buildOnRequestReplyMetadata();
      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});
      expect(entry.subject).toBe('credit.check.completed');
      expect(entry.type).toBe('request-reply');
      expect(entry.handler).toBe('onResponse');
      expect(entry.version).toBe('1');
      expect(entry.tags).toEqual([]);
    });

    it('should propagate description without fallback', () => {
      const metadata = buildOnRequestReplyMetadata({ description: 'Custom response description' });
      const entry = builder.buildOnRequestReplyEntry(metadata, 'onResponse', {});
      expect(entry.description).toBe('Custom response description');
    });
  });

  describe('buildEmitEventEntry', () => {
    it('should build a produce entry with companyId placeholder subject', () => {
      const metadata = buildEmitEventMetadata();
      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});
      expect(entry.subject).toBe('company.{companyId}.payment.proof.uploaded.v1');
      expect(entry.handler).toBe('handleUpload');
      expect(entry.version).toBe('1');
    });

    it('should propagate description and payloadExample without fallbacks', () => {
      const example = { proofId: 'proof-123' };
      const metadata = buildEmitEventMetadata({
        description: 'Custom producer description',
        payloadExample: example,
      });
      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});
      expect(entry.description).toBe('Custom producer description');
      expect(entry.payloadExample).toEqual(example);
    });

    it('should default tags to empty array when omitted', () => {
      const metadata = buildEmitEventMetadata({ tags: undefined });
      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});
      expect(entry.tags).toEqual([]);
    });

    it('should use explicit payloadSchemaRef when provided', () => {
      const metadata = buildEmitEventMetadata({ payloadSchemaRef: 'PaymentProofUploadedData' });
      const entry = builder.buildEmitEventEntry(metadata, 'handleUpload', {});
      expect(entry.payloadSchemaRef).toBe('PaymentProofUploadedData');
    });

    it('should return empty payloadSchemaRef when reflect metadata is missing', () => {
      const metadata = buildEmitEventMetadata();
      const entry = builder.buildEmitEventEntry(metadata, 'noParamsMethod', {});
      expect(entry.payloadSchemaRef).toBe('');
    });
  });

  describe('payloadSchemaRef auto-resolution from reflect metadata', () => {
    class SampleData {
      readonly id!: string;
    }

    class ConsumerWithParam {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      onEvent(_: SampleData): void {}
    }

    it('should resolve payloadSchemaRef from first parameter type for consumers', () => {
      setDesignParamTypes(ConsumerWithParam.prototype, 'onEvent', [SampleData]);
      const metadata = buildOnEventMetadata();
      const entry = builder.buildOnEventEntry(metadata, 'onEvent', ConsumerWithParam.prototype);
      expect(entry.payloadSchemaRef).toBe('SampleData');
    });

    class ProducerWithReturn {
      handleEvent(): SampleData {
        return { id: 'sample' };
      }
    }

    it('should resolve payloadSchemaRef from return type for producers', () => {
      setDesignReturnType(ProducerWithReturn.prototype, 'handleEvent', SampleData);
      const metadata = buildEmitEventMetadata();
      const entry = builder.buildEmitEventEntry(metadata, 'handleEvent', ProducerWithReturn.prototype);
      expect(entry.payloadSchemaRef).toBe('SampleData');
    });
  });
});
