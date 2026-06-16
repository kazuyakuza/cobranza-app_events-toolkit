// @ts-nocheck
/**
 * Outbox + Request-Reply Example
 *
 * Demonstrates how to combine the outbox pattern with async request-reply
 * for guaranteed delivery of request events.
 *
 * Shows both high-level and low-level APIs.
 */
import {
  OutboxService,
  SubjectBuilder,
  ActorType,
  generateUuidV7,
  AsyncRequestEventContext,
} from '@cobranza-apps/events-toolkit';
import { IsUUID, IsString } from 'class-validator';

// ── Data Types ──────────────────────────────────────────────────────

class CreditCheckRequestedData {
  @IsUUID()
  clientId: string;

  @IsString()
  fullName: string;
}

interface RequestCreditCheckParams {
  clientId: string;
  fullName: string;
  companyId: string;
}

// ── 1. High-level API (recommended) ─────────────────────────────────

class DebtService {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(params: RequestCreditCheckParams): Promise<string> {
    const { clientId, fullName, companyId } = params;

    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    const context: AsyncRequestEventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    // sendAsyncRequestThroughOutbox builds the envelope and validates replyTo
    const result = await this.outboxService.sendAsyncRequestThroughOutbox({
      subject: requestSubject,
      payload: { clientId, fullName },
      context,
    });

    return result.correlationId;
  }
}

// ── 2. Low-level API (pre-built envelope) ───────────────────────────

import { createEvent } from '@cobranza-apps/events-toolkit';

class DebtServiceLowLevel {
  constructor(
    private readonly outboxService: OutboxService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(params: RequestCreditCheckParams): Promise<void> {
    const { clientId, fullName, companyId } = params;

    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    const context: AsyncRequestEventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const event = createEvent({ clientId, fullName }, context);

    // sendRequestThroughOutbox validates replyTo at runtime only
    await this.outboxService.sendRequestThroughOutbox(event, requestSubject);
  }
}
