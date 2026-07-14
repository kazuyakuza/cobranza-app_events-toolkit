/**
 * @file Runtime e2e test fixtures for the EventsToolkitModule.
 *
 * Provides Injectable providers used by the full-lifecycle e2e spec
 * (`events-toolkit.runtime.e2e-spec.ts`). These fixtures exercise the
 * explorer prototype-scanning path with getter/setter accessors that throw
 * when accessed on the prototype — the exact shape that caused the
 * `Reflect.getMetadata(undefined)` crash fixed in 0.10.7.
 *
 * AI agents: do not import these outside test specs. They exist solely to
 * guard against regressions in the explorer's property-descriptor logic.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from './consumer/decorators/on-event.decorator';
import { OnRequestReply } from './consumer/decorators/on-request-reply.decorator';

/**
 * Test provider that combines decorated handlers with getter/setter accessors.
 *
 * The `listen$` getter throws `TypeError` when accessed on the prototype,
 * reproducing the crash shape from `HttpAdapterHost.prototype.listen$`.
 * The explorers must skip this accessor via `Object.getOwnPropertyDescriptor`
 * without invoking it.
 */
@Injectable()
export class HandlerWithAccessorsProvider {
  handlerInvoked = false;

  @OnEvent('payment.proof.uploaded', {
    version: '1',
    description: 'Handles payment proof uploads (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploaded(): Promise<void> {
    this.handlerInvoked = true;
  }

  @OnRequestReply('payment.proof.uploaded', {
    description: 'Handles payment proof upload responses (e2e runtime guard)',
    payloadExample: { proofId: 'proof-123' },
  })
  async handleProofUploadedResponse(): Promise<void> {
    this.handlerInvoked = true;
  }

  private _cachedValue = '';

  get cachedValue(): string {
    return this._cachedValue;
  }

  set cachedValue(value: string) {
    this._cachedValue = value;
  }

  get listen$(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'asObservable')");
  }

  plainMethod(): void {}
}
