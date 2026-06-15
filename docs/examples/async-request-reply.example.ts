// @ts-nocheck
/**
 * Async Request-Reply Example
 *
 * Demonstrates the asynchronous request-reply pattern using:
 *   - Requester side: sendRequest() with reply_to
 *   - Responder side: @OnEvent() + buildResponseEnvelope() + sendResponse()
 *   - Response handler: @OnRequestReply() decorator
 */
import {
  RequestReplyService,
  SubjectBuilder,
  EventContext,
  EventEnvelope,
  ActorType,
  generateUuidV7,
  OnRequestReply,
  RequestReplyException,
} from '@cobranza-apps/events-toolkit';
import { OnEvent } from '@cobranza-apps/events-toolkit';
import { IsUUID, IsString, IsNumber, IsBoolean } from 'class-validator';

// ── Data Types ──────────────────────────────────────────────────────

class CreditCheckRequestedData {
  @IsUUID()
  clientId: string;

  @IsString()
  fullName: string;
}

class CreditCheckResultData {
  @IsUUID()
  clientId: string;

  @IsNumber()
  score: number;

  @IsBoolean()
  approved: boolean;
}

interface RequestCreditCheckParams {
  clientId: string;
  fullName: string;
  companyId: string;
}

// ── 1. Requester ────────────────────────────────────────────────────

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(
    params: RequestCreditCheckParams,
  ): Promise<string> {
    const { clientId, fullName, companyId } = params;

    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    const context: EventContext = {
      type: 'credit.check.requested',
      version: '1.0.0',
      producer: 'debt-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'debt-service',
      correlationId: generateUuidV7(),
      replyTo: replySubject,
    };

    const payload = new CreditCheckRequestedData();
    payload.clientId = clientId;
    payload.fullName = fullName;

    const requestSubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'requested',
      version: '1',
    });

    const result = await this.requestReply.sendRequest({
      subject: requestSubject,
      payload,
      context,
    });

    return result.correlationId;
  }
}

// ── 2. Responder ────────────────────────────────────────────────────

class CreditCheckConsumer {
  constructor(private readonly requestReply: RequestReplyService) {}

  @OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
  async onCreditCheckRequested(
    event: EventEnvelope<CreditCheckRequestedData>,
  ): Promise<void> {
    if (!this.requestReply.isRequestReplyMessage(event)) {
      return;
    }

    const resultData = await this.performCreditCheck(event.data);

    const responseEvent = this.requestReply.buildResponseEnvelope({
      requestEvent: event,
      responseContext: {
        type: 'credit.check.completed',
        version: '1.0.0',
        producer: 'credit-service',
        companyId: event.company_id,
        actorType: ActorType.SYSTEM,
        actorId: 'credit-service',
        correlationId: event.correlation_id,
        replyTo: event.reply_to,
      },
      responseData: resultData,
    });

    await this.requestReply.sendResponse(
      event.correlation_id,
      responseEvent,
    );
  }

  private async performCreditCheck(
    data: CreditCheckRequestedData,
  ): Promise<CreditCheckResultData> {
    const result = new CreditCheckResultData();
    result.clientId = data.clientId;
    result.score = 750;
    result.approved = true;
    return result;
  }
}

// ── 3. Response Handler ─────────────────────────────────────────────

class DebtServiceResponseHandler {
  @OnRequestReply({ eventType: 'credit.check.completed' })
  async handleCreditCheckResponse(
    event: EventEnvelope<CreditCheckResultData>,
  ): Promise<void> {
    console.log(
      `Credit check result for client ${event.data.clientId}: ` +
        `score=${event.data.score}, approved=${event.data.approved}`,
    );
  }
}
