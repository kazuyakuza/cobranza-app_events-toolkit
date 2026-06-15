/**
 * Async Request-Reply Example
 *
 * Demonstrates the asynchronous request-reply pattern using:
 *   - Requester side: sendRequest() with reply_to
 *   - Responder side: @OnEvent() + buildResponseEnvelope() + sendResponse()
 *   - Response handler: @OnRequestReply() decorator
 *
 * This pattern is non-blocking: the requester publishes a request and
 * continues processing. The response arrives later via a separate handler.
 */

import {
  RequestReplyService,
  SubjectBuilder,
  EventContext,
  EventEnvelope,
  ActorType,
  generateUuidV7,
  buildSubject,
  buildResponseSubject,
  ResponseSuffix,
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

// ═════════════════════════════════════════════════════════════════════
// 1. Requester — sends async request with reply_to
// ═════════════════════════════════════════════════════════════════════

class DebtService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestCreditCheck(
    clientId: string,
    fullName: string,
    companyId: string,
  ): Promise<string> {
    // Preferred: use a descriptive past-tense response subject
    const replySubject = this.subjectBuilder.build({
      companyId,
      domain: 'credit',
      entity: 'check',
      action: 'completed',
      version: '1',
    });

    // Alternative: use the .response suffix via buildResponseSubject helper
    // const replySubject = buildResponseSubject({
    //   companyId,
    //   domain: 'credit',
    //   entity: 'check',
    //   action: 'requested',
    //   version: '1',
    // });
    // Or using the helper:
    // const replySubject = buildResponseSubject(buildSubject({ ... }));

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

// ═════════════════════════════════════════════════════════════════════
// 2. Responder — receives request and sends response
// ═════════════════════════════════════════════════════════════════════

class CreditCheckConsumer {
  constructor(private readonly requestReply: RequestReplyService) {}

  @OnEvent({ domain: 'credit', entity: 'check', action: 'requested' })
  async onCreditCheckRequested(
    event: EventEnvelope<CreditCheckRequestedData>,
  ): Promise<void> {
    // Ignore events that are not request-reply messages
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

// ═════════════════════════════════════════════════════════════════════
// 3. Response handler — receives async response via @OnRequestReply
// ═════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════
// Module Wiring Example
// ═════════════════════════════════════════════════════════════════════
//
// import { Module } from '@nestjs/common';
// import { ConsumerModule } from '@cobranza-apps/events-toolkit';
// import { connect } from 'nats';
//
// @Module({
//   imports: [
//     ConsumerModule.forRoot({
//       connection: await connect({ servers: ['nats://localhost:4222'] }),
//       responseSubjectPattern: 'company.*.credit.check.completed.v1',
//     }),
//   ],
//   providers: [
//     DebtService,
//     CreditCheckConsumer,
//     DebtServiceResponseHandler,
//   ],
// })
// export class CreditModule {}
