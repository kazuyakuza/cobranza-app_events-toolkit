import 'reflect-metadata';
import { EMIT_EVENT_METADATA, EmitEventOptions, EmitEvent } from './emit-event.decorator';

describe('EmitEvent', () => {
  it('should store metadata on the decorated method via @EmitEvent()', () => {
    const options: EmitEventOptions = {
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '2',
    };

    class TestProducer {
      @EmitEvent(options)
      handleUpload(): void {}
    }

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleUpload);
    expect(metadata).toEqual(options);
  });

  it('should store metadata without version via @EmitEvent()', () => {
    const options: EmitEventOptions = {
      domain: 'debt',
      entity: 'schedule',
      action: 'processed',
    };

    class TestProducer {
      @EmitEvent(options)
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleProcessed);
    expect(metadata).toEqual(options);
  });
});
