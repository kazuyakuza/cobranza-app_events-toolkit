/**
 * @file Unit-test fixtures for `OnRequestReplyExplorer`.
 *
 * Exports provider classes with `@OnRequestReply()` decorated methods, plain
 * methods, and getter/setter accessors (including a throwing `listen$` getter).
 * Used by `on-request-reply.explorer.spec.ts` to verify that the explorer
 * correctly registers decorated handlers and safely skips accessor properties.
 *
 * AI agents: do not import these outside explorer unit tests.
 */
import { OnRequestReply } from './on-request-reply.decorator';

export class SampleConsumer {
  handlerInvoked = false;

  @OnRequestReply('payment.proof.uploaded', {
    companyId: 'tenant-1',
    description: 'Handles payment proof responses',
    payloadExample: { proofId: 'proof-123' },
  })
  handleProofUploaded(): void {
    this.handlerInvoked = true;
  }

  @OnRequestReply('debt.schedule.created', {
    description: 'Handles debt schedule responses',
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

export class CompanyScopedConsumer {
  handlerInvoked = false;

  @OnRequestReply('client.profile.updated', {
    companyId: 'tenant-2',
    description: 'Handles client profile responses',
    payloadExample: { clientId: 'client-1' },
  })
  handleUpdated(): void {
    this.handlerInvoked = true;
  }
}

export class GetterSetterConsumer {
  handlerInvoked = false;

  @OnRequestReply('audit.ledger.snapshot', {
    companyId: 'tenant-1',
    description: 'Handles audit ledger responses',
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

export class IdempotentRequestReplyConsumer {
  invokeCount = 0;

  @OnRequestReply('billing.invoice.adjusted', {
    description: 'Handles invoice adjustment responses idempotently',
    payloadExample: { invoiceId: 'inv-1' },
    idempotent: true,
  })
  handleAdjusted(): void {
    this.invokeCount += 1;
  }
}

export class FailingThenSucceedingRequestReplyConsumer {
  invokeCount = 0;
  shouldFail = true;

  @OnRequestReply('billing.invoice.adjusted', {
    description: 'Handles invoice adjustment responses idempotently',
    payloadExample: { invoiceId: 'inv-1' },
    idempotent: true,
  })
  handleAdjusted(): void {
    this.invokeCount += 1;
    if (this.shouldFail) {
      throw new Error('first attempt fails');
    }
  }
}
