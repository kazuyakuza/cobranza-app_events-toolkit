import 'reflect-metadata';
import { ON_EVENT_METADATA, OnEventOptions, OnEvent } from './on-event.decorator';

describe('OnEvent', () => {
  it('should store metadata on the decorated method via @OnEvent()', () => {
    const options: OnEventOptions = {
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1',
    };

    class TestConsumer {
      @OnEvent(options)
      handleProofUploaded(): void {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProofUploaded);
    expect(metadata).toEqual(options);
  });

  it('should store metadata with default version omitted via @OnEvent()', () => {
    const options: OnEventOptions = {
      domain: 'debt',
      entity: 'schedule',
      action: 'processed',
    };

    class TestConsumer {
      @OnEvent(options)
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProcessed);
    expect(metadata).toEqual(options);
    expect(metadata.version).toBeUndefined();
  });

  it('should allow multiple methods with different @OnEvent options', () => {
    const options1: OnEventOptions = { domain: 'payment', entity: 'proof', action: 'uploaded' };
    const options2: OnEventOptions = { domain: 'debt', entity: 'schedule', action: 'created' };

    class TestConsumer {
      @OnEvent(options1)
      handleProofUploaded(): void {}

      @OnEvent(options2)
      handleScheduleCreated(): void {}
    }

    const metadata1 = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleProofUploaded);
    const metadata2 = Reflect.getMetadata(ON_EVENT_METADATA, TestConsumer.prototype.handleScheduleCreated);

    expect(metadata1).toEqual(options1);
    expect(metadata2).toEqual(options2);
  });
});
