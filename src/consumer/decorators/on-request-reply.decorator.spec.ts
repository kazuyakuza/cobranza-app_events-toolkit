import 'reflect-metadata';
import {
  ON_REQUEST_REPLY_METADATA,
  OnRequestReplyOptions,
  OnRequestReplyMetadata,
  OnRequestReply,
} from './on-request-reply.decorator';

describe('OnRequestReply', () => {
  it('should store metadata with eventType and companyId via @OnRequestReply()', () => {
    class TestConsumer {
      @OnRequestReply('payment.proof.uploaded', {
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        description: 'Payment proof upload response',
        payloadExample: { proofId: 'proof-123' },
      })
      handleResponse(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleResponse,
    ) as OnRequestReplyMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.companyId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(metadata.description).toBe('Payment proof upload response');
    expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
  });

  it('should store metadata with eventType only when companyId is omitted', () => {
    class TestConsumer {
      @OnRequestReply('debt.schedule.processed', {
        description: 'Debt schedule processed response',
        payloadExample: { scheduleId: 'sch-123' },
      })
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleProcessed,
    ) as OnRequestReplyMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.companyId).toBeUndefined();
    expect(metadata.description).toBe('Debt schedule processed response');
    expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
  });

  it('should allow multiple methods with different @OnRequestReply event types', () => {
    class TestConsumer {
      @OnRequestReply('payment.proof.uploaded', {
        companyId: 'tenant-1',
        description: 'Payment proof upload response',
        payloadExample: { proofId: 'proof-123' },
      })
      handleProofUploaded(): void {}

      @OnRequestReply('debt.schedule.created', {
        description: 'Debt schedule created response',
        payloadExample: { scheduleId: 'sch-123' },
      })
      handleScheduleCreated(): void {}
    }

    const metadata1 = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleProofUploaded,
    ) as OnRequestReplyMetadata;
    const metadata2 = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleScheduleCreated,
    ) as OnRequestReplyMetadata;

    expect(metadata1.eventType).toBe('payment.proof.uploaded');
    expect(metadata1.companyId).toBe('tenant-1');
    expect(metadata2.eventType).toBe('debt.schedule.created');
    expect(metadata2.companyId).toBeUndefined();
  });

  it('should store payloadExample when provided', () => {
    const payloadExample = { proofId: 'proof-123' };

    class TestConsumer {
      @OnRequestReply('payment.proof.uploaded', {
        description: 'Payment proof upload response',
        payloadExample,
      })
      handleResponse(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleResponse,
    ) as OnRequestReplyMetadata;
    expect(metadata.payloadExample).toEqual(payloadExample);
  });

  it('should store all rich metadata fields', () => {
    const options: OnRequestReplyOptions = {
      companyId: 'tenant-1',
      description: 'Payment proof upload response',
      tags: ['payment', 'proof'],
      payloadSchemaRef: 'PaymentProofData',
      payloadExample: { proofId: 'proof-123' },
    };

    class TestConsumer {
      @OnRequestReply('payment.proof.uploaded', options)
      handleResponse(): void {}
    }

    const metadata = Reflect.getMetadata(
      ON_REQUEST_REPLY_METADATA,
      TestConsumer.prototype.handleResponse,
    ) as OnRequestReplyMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.companyId).toBe('tenant-1');
    expect(metadata.description).toBe('Payment proof upload response');
    expect(metadata.tags).toEqual(['payment', 'proof']);
    expect(metadata.payloadSchemaRef).toBe('PaymentProofData');
    expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
  });
});
