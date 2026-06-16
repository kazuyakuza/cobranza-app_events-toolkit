import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { EventContext } from '../common/envelope/event-context.interface';
import { generateEventId } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import {
  RequestReplyRequestOptions,
  RequestReplyResponse,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from '../request-reply/request-reply.types';

export interface RequestCall {
  subject: string;
  payload: unknown;
  options: RequestReplyRequestOptions;
  context: EventContext;
}

export interface SendResponseCall {
  correlationId: string;
  event: EventEnvelope<unknown>;
}

@Injectable()
export class MockRequestReplyService {
  private readonly requests: RequestCall[] = [];
  private readonly sendResponseCalls: SendResponseCall[] = [];
  private readonly sendRequestCalls: SendRequestOptions<unknown>[] = [];
  private mockResponse: RequestReplyResponse<unknown> = { data: {}, raw: new Uint8Array(0) };

  setMockResponse<R>(response: RequestReplyResponse<R>): void {
    this.mockResponse = response as RequestReplyResponse<unknown>;
  }

  async request<T, R>(
    subject: string,
    payload: T,
    options: RequestReplyRequestOptions & { context: EventContext },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    this.requests.push({ subject, payload, options: requestOptions, context });
    return this.mockResponse as RequestReplyResponse<R>;
  }

  async sendResponse(correlationId: string, responseEvent: EventEnvelope<unknown>): Promise<void> {
    this.sendResponseCalls.push({ correlationId, event: responseEvent });
  }

  isRequestReplyMessage(event: EventEnvelope<unknown>): boolean {
    return this.hasNonEmptyReplyTo(event);
  }

  private hasNonEmptyReplyTo(event: EventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
    this.sendRequestCalls.push(options as SendRequestOptions<unknown>);
    return { correlationId: 'mock-correlation-id' };
  }

  buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): EventEnvelope<R> {
    const preservedContext: EventContext = {
      ...options.responseContext,
      correlationId: options.requestEvent.correlation_id,
      causationId: options.requestEvent.id,
    };
    return new EventEnvelope<R>({
      id: generateEventId(),
      produced_at: nowIso(),
      type: preservedContext.type,
      version: preservedContext.version,
      producer: preservedContext.producer,
      company_id: preservedContext.companyId,
      actor_type: preservedContext.actorType,
      actor_id: preservedContext.actorId,
      correlation_id: preservedContext.correlationId,
      causation_id: preservedContext.causationId,
      trace_id: preservedContext.traceId,
      data: options.responseData,
    });
  }

  getRequests(): ReadonlyArray<RequestCall> {
    return this.requests;
  }

  getSendResponseCalls(): ReadonlyArray<SendResponseCall> {
    return this.sendResponseCalls;
  }

  getSendRequestCalls(): ReadonlyArray<SendRequestOptions<unknown>> {
    return this.sendRequestCalls;
  }

  clear(): void {
    this.requests.length = 0;
    this.sendResponseCalls.length = 0;
    this.sendRequestCalls.length = 0;
    this.mockResponse = { data: {}, raw: new Uint8Array(0) };
  }
}
