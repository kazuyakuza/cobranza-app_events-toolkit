import { Injectable } from '@nestjs/common';
import { OnEvent } from './consumer/decorators/on-event.decorator';
import { OnRequestReply } from './consumer/decorators/on-request-reply.decorator';

/**
 * Test provider that combines decorated handlers with getter/setter accessors.
 *
 * The accessors trigger `Object.getOwnPropertyNames(prototype)` to return
 * non-function members, which is exactly the shape that produced the
 * `Reflect.getMetadata(undefined)` crash before the `typeof methodRef` guard.
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
