import 'reflect-metadata';
import { EMIT_EVENT_METADATA, EmitEventOptions, EmitEventMetadata, EmitEvent } from './emit-event.decorator';

describe('EmitEvent', () => {
  it('should store metadata on the decorated method via @EmitEvent()', () => {
    class TestProducer {
      @EmitEvent('payment.proof.uploaded', { version: '2' })
      handleUpload(): void {}
    }

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleUpload) as EmitEventMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.version).toBe('2');
  });

  it('should store metadata without version via @EmitEvent()', () => {
    class TestProducer {
      @EmitEvent('debt.schedule.processed')
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(
      EMIT_EVENT_METADATA,
      TestProducer.prototype.handleProcessed,
    ) as EmitEventMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.version).toBeUndefined();
  });

  it('should store payloadExample when provided', () => {
    const payloadExample = { scheduleId: 'sch-123', amount: 250 };

    class TestProducer {
      @EmitEvent('debt.schedule.processed', { payloadExample })
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(
      EMIT_EVENT_METADATA,
      TestProducer.prototype.handleProcessed,
    ) as EmitEventMetadata;
    expect(metadata.payloadExample).toEqual(payloadExample);
  });

  it('should store all rich metadata fields', () => {
    const options: EmitEventOptions = {
      version: '1',
      description: 'Debt schedule processed',
      tags: ['debt', 'schedule'],
      payloadSchemaRef: 'DebtScheduleProcessedEvent',
      payloadExample: { scheduleId: 'sch-123' },
    };

    class TestProducer {
      @EmitEvent('debt.schedule.processed', options)
      handleProcessed(): void {}
    }

    const metadata = Reflect.getMetadata(
      EMIT_EVENT_METADATA,
      TestProducer.prototype.handleProcessed,
    ) as EmitEventMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.version).toBe('1');
    expect(metadata.description).toBe('Debt schedule processed');
    expect(metadata.tags).toEqual(['debt', 'schedule']);
    expect(metadata.payloadSchemaRef).toBe('DebtScheduleProcessedEvent');
    expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
  });
});
