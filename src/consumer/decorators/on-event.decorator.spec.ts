import 'reflect-metadata';
import { ON_EVENT_METADATA, OnEventOptions } from './on-event.decorator';

describe('OnEvent', () => {
  it('should store metadata on the method via SetMetadata', () => {
    const options: OnEventOptions = {
      domain: 'payment',
      entity: 'proof',
      action: 'uploaded',
      version: '1',
    };

    const handler = function handleProofUploaded() {};
    Reflect.defineMetadata(ON_EVENT_METADATA, options, handler);

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, handler);
    expect(metadata).toEqual(options);
  });

  it('should store metadata with default version omitted', () => {
    const options: OnEventOptions = {
      domain: 'debt',
      entity: 'schedule',
      action: 'processed',
    };

    const handler = function handleProcessed() {};
    Reflect.defineMetadata(ON_EVENT_METADATA, options, handler);

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA, handler);
    expect(metadata).toEqual(options);
    expect(metadata.version).toBeUndefined();
  });

  it('should allow multiple methods with different OnEvent options', () => {
    const options1: OnEventOptions = { domain: 'payment', entity: 'proof', action: 'uploaded' };
    const options2: OnEventOptions = { domain: 'debt', entity: 'schedule', action: 'created' };

    const handler1 = function handleProofUploaded() {};
    const handler2 = function handleScheduleCreated() {};
    Reflect.defineMetadata(ON_EVENT_METADATA, options1, handler1);
    Reflect.defineMetadata(ON_EVENT_METADATA, options2, handler2);

    const metadata1 = Reflect.getMetadata(ON_EVENT_METADATA, handler1);
    const metadata2 = Reflect.getMetadata(ON_EVENT_METADATA, handler2);

    expect(metadata1).toEqual(options1);
    expect(metadata2).toEqual(options2);
  });
});