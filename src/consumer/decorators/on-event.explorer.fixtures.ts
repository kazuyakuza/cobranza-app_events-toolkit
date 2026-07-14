/**
 * @file Unit-test fixtures for `OnEventExplorer`.
 *
 * Exports provider classes with `@OnEvent()` decorated methods, plain methods,
 * and getter/setter accessors (including a throwing `listen$` getter). Used by
 * `on-event.explorer.spec.ts` to verify that the explorer correctly registers
 * decorated handlers and safely skips accessor properties.
 *
 * AI agents: do not import these outside explorer unit tests.
 */
import { OnEvent } from './on-event.decorator';

export class SampleConsumer {
  handlerInvoked = false;

  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof uploads',
    payloadExample: { proofId: 'proof-123' },
  })
  handleProofUploaded(): void {
    this.handlerInvoked = true;
  }

  @OnEvent('debt.schedule.created', {
    version: '1',
    description: 'Handles debt schedule creation',
    payloadExample: { scheduleId: 'sch-123' },
  })
  handleScheduleCreated(): void {
    this.handlerInvoked = true;
  }

  plainMethod(): void {}
}

export class ConsumerWithoutDecorator {
  noEventMethod(): void {}
}

export class CustomVersionConsumer {
  handlerInvoked = false;

  @OnEvent('client.profile.updated', {
    version: '2',
    description: 'Handles client profile updates',
    payloadExample: { clientId: 'client-1' },
  })
  handleUpdated(): void {
    this.handlerInvoked = true;
  }
}

export class GetterSetterConsumer {
  handlerInvoked = false;

  @OnEvent('audit.ledger.snapshot', {
    version: '1',
    description: 'Handles audit ledger snapshots',
    payloadExample: { ledgerId: 'led-1' },
  })
  handleSnapshot(): void {
    this.handlerInvoked = true;
  }

  get readOnlyValue(): string {
    return 'constant';
  }

  set writeOnlyValue(_value: string) {
    void _value;
  }

  get computed(): number {
    return 42;
  }

  set computed(_value: number) {
    void _value;
  }

  get listen$(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'asObservable')");
  }

  plainMethod(): void {}
}
