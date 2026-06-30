import 'reflect-metadata';
import { EMIT_EVENT_METADATA, EmitEventOptions, EmitEventMetadata, EmitEvent } from './emit-event.decorator';

describe('EmitEvent', () => {
  it('should store metadata on the decorated method via @EmitEvent()', () => {
    class TestProducer {
      @EmitEvent('payment.proof.uploaded', {
        version: '2',
        description: 'Payment proof was uploaded',
        payloadExample: { proofId: 'proof-123' },
      })
      handleUpload(): void { }
    }

    const metadata = Reflect.getMetadata(EMIT_EVENT_METADATA, TestProducer.prototype.handleUpload) as EmitEventMetadata;
    expect(metadata.eventType).toBe('payment.proof.uploaded');
    expect(metadata.version).toBe('2');
    expect(metadata.description).toBe('Payment proof was uploaded');
    expect(metadata.payloadExample).toEqual({ proofId: 'proof-123' });
  });

  it('should store metadata with version via @EmitEvent()', () => {
    class TestProducer {
      @EmitEvent('debt.schedule.processed', {
        version: '1',
        description: 'Debt schedule processed',
        payloadExample: { scheduleId: 'sch-123' },
      })
      handleProcessed(): void { }
    }

    const metadata = Reflect.getMetadata(
      EMIT_EVENT_METADATA,
      TestProducer.prototype.handleProcessed,
    ) as EmitEventMetadata;
    expect(metadata.eventType).toBe('debt.schedule.processed');
    expect(metadata.version).toBe('1');
    expect(metadata.description).toBe('Debt schedule processed');
    expect(metadata.payloadExample).toEqual({ scheduleId: 'sch-123' });
  });

  it('should store payloadExample when provided', () => {
    const payloadExample = { scheduleId: 'sch-123', amount: 250 };

    class TestProducer {
      @EmitEvent('debt.schedule.processed', {
        version: '1',
        description: 'Debt schedule processed',
        payloadExample,
      })
      handleProcessed(): void { }
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
      handleProcessed(): void { }
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
