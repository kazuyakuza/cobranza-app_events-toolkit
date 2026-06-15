import 'reflect-metadata';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyOptions, OnRequestReply } from './on-request-reply.decorator';

describe('OnRequestReply', () => {
  it('should store metadata with eventType and companyId via @OnRequestReply()', () => {
    const options: OnRequestReplyOptions = {
      eventType: 'payment.proof.uploaded',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
    };

    class TestConsumer {
      @OnRequestReply(options)
      handleResponse(): void {}
    }

    const metadata = Reflect.getMetadata(ON_REQUEST_REPLY_METADATA, TestConsumer.prototype.handleResponse);
    expect(metadata).toEqual(options);
  });

  it('should store metadata with eventType only when companyId is omitted', () => {
    const options: OnRequestReplyOptions = {
      eventType: 'debt.schedule.processed',
    };

    class TestConsumer {
      @OnRequestReply(options)
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(ON_REQUEST_REPLY_METADATA, TestConsumer.prototype.handleProcessed);
    expect(metadata).toEqual(options);
    expect(metadata.companyId).toBeUndefined();
  });

  it('should allow multiple methods with different @OnRequestReply options', () => {
    const options1: OnRequestReplyOptions = {
      eventType: 'payment.proof.uploaded',
      companyId: 'tenant-1',
    };
    const options2: OnRequestReplyOptions = {
      eventType: 'debt.schedule.created',
    };

    class TestConsumer {
      @OnRequestReply(options1)
      handleProofUploaded(): void {}

      @OnRequestReply(options2)
      handleScheduleCreated(): void {}
    }

    const metadata1 = Reflect.getMetadata(ON_REQUEST_REPLY_METADATA, TestConsumer.prototype.handleProofUploaded);
    const metadata2 = Reflect.getMetadata(ON_REQUEST_REPLY_METADATA, TestConsumer.prototype.handleScheduleCreated);

    expect(metadata1).toEqual(options1);
    expect(metadata2).toEqual(options2);
  });
});
