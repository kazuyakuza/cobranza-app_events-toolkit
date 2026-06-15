/**
 * Sync Request-Reply Example
 *
 * Demonstrates the synchronous request-reply pattern using
 * RequestReplyService.request() with a timeout-based response wait.
 *
 * Usage in a NestJS microservice:
 *   - Inject RequestReplyService and SubjectBuilder
 *   - Call request() with subject, payload, and timeout
 *   - Handle the typed response or catch RequestReplyException
 */

import {
  RequestReplyService,
  SubjectBuilder,
  EventContext,
  ActorType,
  generateUuidV7,
  buildSubject,
  RequestReplyException,
} from '@cobranza-apps/events-toolkit';
import { IsUUID, IsString, IsBoolean } from 'class-validator';

// ── Data Types ──────────────────────────────────────────────────────

class VerificationRequestedData {
  @IsUUID()
  paymentId: string;

  @IsString()
  documentHash: string;
}

class VerificationResultData {
  @IsUUID()
  paymentId: string;

  @IsBoolean()
  verified: boolean;

  @IsString()
  verifiedAt: string;
}

interface RequestVerificationStatusParams {
  companyId: string;
  paymentId: string;
  documentHash: string;
}

// ── Service ─────────────────────────────────────────────────────────

class VerificationService {
  constructor(
    private readonly requestReply: RequestReplyService,
    private readonly subjectBuilder: SubjectBuilder,
  ) {}

  async requestVerificationStatus(
    params: RequestVerificationStatusParams,
  ): Promise<VerificationResultData> {
    const { companyId, paymentId, documentHash } = params;
    const subject = this.subjectBuilder.build({
      companyId,
      domain: 'verification',
      entity: 'document',
      action: 'requested',
      version: '1',
    });

    const context: EventContext = {
      type: 'verification.document.requested',
      version: '1.0.0',
      producer: 'payment-service',
      companyId,
      actorType: ActorType.SYSTEM,
      actorId: 'payment-service',
      correlationId: generateUuidV7(),
    };

    const payload = new VerificationRequestedData();
    payload.paymentId = paymentId;
    payload.documentHash = documentHash;

    try {
      const response = await this.requestReply.request<
        VerificationRequestedData,
        VerificationResultData
      >(subject, payload, { context, timeoutMs: 15000 });

      return response.data;
    } catch (error) {
      if (error instanceof RequestReplyException) {
        console.error(
          `Request-reply failed: ${error.message} (eventId=${error.eventId}, correlationId=${error.correlationId})`,
        );
      }
      throw error;
    }
  }

  // ── Alternative using the standalone buildSubject helper ──────────

  async requestUsingHelper(
    companyId: string,
    paymentId: string,
  ): Promise<VerificationResultData> {
    const subject = buildSubject({
      companyId,
      domain: 'verification',
      entity: 'document',
      action: 'requested',
      version: '1',
    });

    const payload = new VerificationRequestedData();
    payload.paymentId = paymentId;
    payload.documentHash = 'abc123';

    const response = await this.requestReply.request<
      VerificationRequestedData,
      VerificationResultData
    >(subject, payload, {
      context: {
        type: 'verification.document.requested',
        version: '1.0.0',
        producer: 'payment-service',
        companyId,
        actorType: ActorType.SYSTEM,
        actorId: 'payment-service',
        correlationId: generateUuidV7(),
      },
      timeoutMs: 10000,
    });

    return response.data;
  }
}
