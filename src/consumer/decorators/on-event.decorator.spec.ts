import 'reflect-metadata';
import { ON_EVENT_METADATA, OnEventOptions, OnEventMetadata, OnEvent } from './on-event.decorator';

describe('OnEvent', () => {
  it('should store metadata on the decorated method via @OnEvent()', () => {
    class TestConsumer {
      @OnEvent('payment.proof.uploaded', { version: '1' })
      handleProofUploaded(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnEventMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.version).toBe('1');
  });

  it('should store metadata with default version omitted via @OnEvent()', () => {
    class TestConsumer {
      @OnEvent('debt.schedule.processed')
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProcessed) as OnEventMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.version).toBeUndefined();
  });

  it('should allow multiple methods with different @OnEvent event types', () => {
    class TestConsumer {
      @OnEvent('payment.proof.uploaded')
      handleProofUploaded(): void {}

      @OnEvent('debt.schedule.created')
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
      @OnEvent('payment.proof.uploaded', { payloadExample })
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
});
