import 'reflect-metadata';
import { ON_EVENT_METADATA, OnEventOptions, OnEventMetadata, OnEvent } from './on-event.decorator';
import { EventScope } from '../../common/envelope/event-scope.enum';

describe('OnEvent', () => {
  it('should store metadata on the decorated method via @OnEvent()', () => {
    class TestConsumer {
      @OnEvent('payment.proof.uploaded', {
        version: '1',
        description: 'Payment proof was uploaded',
        payloadExample: { proofId: 'proof-123' },
      })
      handleProofUploaded(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnEventMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.version).toBe('1');
    expect(metadata.description).toBe('Payment proof was uploaded');
    expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
  });

  it('should store metadata with version via @OnEvent()', () => {
    class TestConsumer {
      @OnEvent('debt.schedule.processed', {
        version: '1',
        description: 'Debt schedule processed',
        payloadExample: { scheduleId: 'sch-123' },
      })
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProcessed) as OnEventMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.version).toBe('1');
    expect(metadata.description).toBe('Debt schedule processed');
    expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
  });

  it('should allow multiple methods with different @OnEvent event types', () => {
    class TestConsumer {
      @OnEvent('payment.proof.uploaded', {
        version: '1',
        description: 'Payment proof was uploaded',
        payloadExample: { proofId: 'proof-123' },
      })
      handleProofUploaded(): void {}

      @OnEvent('debt.schedule.created', {
        version: '1',
        description: 'Debt schedule created',
        payloadExample: { scheduleId: 'sch-123' },
      })
      handleScheduleCreated(): void {}
    }

    const metadata1 = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnEventMetadata;
    const metadata2 = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleScheduleCreated,
    ) as OnEventMetadata;

    expect(metadata1.eventType).toBe('payment.proof.uploaded');
    expect(metadata2.eventType).toBe('debt.schedule.created');
  });

  it('should store payloadExample when provided', () => {
    const payloadExample = { proofId: 'proof-123', amount: 250 };

    class TestConsumer {
      @OnEvent('payment.proof.uploaded', {
        version: '1',
        description: 'Payment proof was uploaded',
        payloadExample,
      })
      handleProofUploaded(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnEventMetadata;
    expect(metadata.payloadExample).toEqual(payloadExample);
  });

  it('should store all rich metadata fields', () => {
    const options: OnEventOptions = {
      version: '2',
      description: 'Payment proof was uploaded',
      tags: ['payment', 'proof'],
      payloadSchemaRef: 'PaymentProofUploadedEvent',
      payloadExample: { proofId: 'proof-123' },
    };

    class TestConsumer {
      @OnEvent('payment.proof.uploaded', options)
      handleProofUploaded(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnEventMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.version).toBe('2');
    expect(metadata.description).toBe('Payment proof was uploaded');
    expect(metadata.tags).toEqual(['payment', 'proof']);
    expect(metadata.payloadSchemaRef).toBe('PaymentProofUploadedEvent');
    expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
  });

  describe('scope support', () => {
    it('stores scope: EventScope.GLOBAL when provided', () => {
      class TestConsumer {
        @OnEvent('iam.company.created', {
          version: '1',
          description: 'Company created',
          payloadExample: { name: 'Acme' },
          scope: EventScope.GLOBAL,
        })
        handleGlobalEvent(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_EVENT_METADATA,
        TestConsumer.prototype.handleGlobalEvent,
      ) as OnEventMetadata;
      expect(metadata.scope).toBe(EventScope.GLOBAL);
    });

    it('stores scope: EventScope.TENANT when provided', () => {
      class TestConsumer {
        @OnEvent('payment.proof.uploaded', {
          version: '1',
          description: 'Payment proof uploaded',
          payloadExample: { proofId: 'proof-123' },
          scope: EventScope.TENANT,
        })
        handleTenantEvent(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_EVENT_METADATA,
        TestConsumer.prototype.handleTenantEvent,
      ) as OnEventMetadata;
      expect(metadata.scope).toBe(EventScope.TENANT);
    });

    it('scope is undefined when not provided (backward compat)', () => {
      class TestConsumer {
        @OnEvent('debt.schedule.processed', {
          version: '1',
          description: 'Debt schedule processed',
          payloadExample: { scheduleId: 'sch-123' },
        })
        handleLegacyEvent(): void {}
      }

      const metadata = Reflect.getMetadata(
        ON_EVENT_METADATA,
        TestConsumer.prototype.handleLegacyEvent,
      ) as OnEventMetadata;
      expect(metadata.scope).toBeUndefined();
    });
  });
});
