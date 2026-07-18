import { Injectable } from '@nestjs/common';
import { AnyEventEnvelope, AnyEventContext, isGlobalContext } from '../common/envelope/envelope-types';
import { EventContext } from '../common/envelope/event-context.interface';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import {
  RequestReplyRequestOptions,
  RequestReplyResponse,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from '../request-reply/request-reply.types';
import { buildEnvelope, buildGlobalEnvelope } from '../request-reply/request-reply.helpers';

/** A recorded synchronous `request()` call captured by `MockRequestReplyService`. */
export interface RequestCall {
  /** The NATS subject the request was sent to. */
  subject: string;
  /** The request payload. */
  payload: unknown;
  /** Request options (timeout, etc.) excluding context. */
  options: RequestReplyRequestOptions;
  /** The event context used for the request. */
  context: EventContext | GlobalEventContext;
}

/** A recorded `sendResponse()` call captured by `MockRequestReplyService`. */
export interface SendResponseCall {
  /** The correlation ID linking request and response. */
  correlationId: string;
  /** The response event envelope. */
  event: AnyEventEnvelope<unknown>;
}

/**
 * In-memory mock for `RequestReplyService`.
 *
 * Records all request/response calls and returns a configurable mock response
 * for synchronous `request()` calls.
 */
@Injectable()
export class MockRequestReplyService {
  private readonly requests: RequestCall[] = [];
  private readonly sendResponseCalls: SendResponseCall[] = [];
  private readonly sendRequestCalls: SendRequestOptions<unknown>[] = [];
  private mockResponse: RequestReplyResponse<unknown> = { data: {}, raw: new Uint8Array(0) };

  /** Configures the response returned by the next `request()` call. */
  setMockResponse<R>(response: RequestReplyResponse<R>): void {
    this.mockResponse = response as RequestReplyResponse<unknown>;
  }

  /**
   * Records a synchronous request and returns the configured mock response.
   */
  async request<T, R>(
    subject: string,
    payload: T,
    options: RequestReplyRequestOptions & { context: EventContext | GlobalEventContext },
  ): Promise<RequestReplyResponse<R>> {
    const { context, ...requestOptions } = options;
    this.requests.push({ subject, payload, options: requestOptions, context });
    return this.mockResponse as RequestReplyResponse<R>;
  }

  /** Records a response sent for an incoming request. */
  async sendResponse(correlationId: string, responseEvent: AnyEventEnvelope<unknown>): Promise<void> {
    this.sendResponseCalls.push({ correlationId, event: responseEvent });
  }

  /** Returns `true` if the event has a non-empty `reply_to` field. */
  isRequestReplyMessage(event: AnyEventEnvelope<unknown>): boolean {
    return this.hasNonEmptyReplyTo(event);
  }

  private hasNonEmptyReplyTo(event: AnyEventEnvelope<unknown>): boolean {
    return typeof event.reply_to === 'string' && event.reply_to.length > 0;
  }

  /** Records an async request and returns `{ correlationId: 'mock-correlation-id' }`. */
  async sendRequest<T>(options: SendRequestOptions<T>): Promise<SendRequestResult> {
    this.sendRequestCalls.push(options as SendRequestOptions<unknown>);
    return { correlationId: 'mock-correlation-id' };
  }

  /** Builds a response envelope, preserving correlation and causation from the request. */
  buildResponseEnvelope<R>(options: BuildResponseEnvelopeOptions<R>): AnyEventEnvelope<R> {
    const preservedContext: AnyEventContext = {
      ...options.responseContext,
      correlationId: options.requestEvent.correlation_id,
      causationId: options.requestEvent.id,
    };
    if (isGlobalContext(preservedContext)) {
      return buildGlobalEnvelope(preservedContext, options.responseData);
    }
    const tenantContext = preservedContext as EventContext;
    return buildEnvelope(tenantContext, options.responseData);
  }

  /** Returns all recorded synchronous request calls. */
  getRequests(): ReadonlyArray<RequestCall> {
    return this.requests;
  }

  /** Returns all recorded `sendResponse()` calls. */
  getSendResponseCalls(): ReadonlyArray<SendResponseCall> {
    return this.sendResponseCalls;
  }

  /** Returns all recorded async `sendRequest()` calls. */
  getSendRequestCalls(): ReadonlyArray<SendRequestOptions<unknown>> {
    return this.sendRequestCalls;
  }

  /** Resets all recorded calls and restores the default mock response. */
  clear(): void {
    this.requests.length = 0;
    this.sendResponseCalls.length = 0;
    this.sendRequestCalls.length = 0;
    this.mockResponse = { data: {}, raw: new Uint8Array(0) };
  }
}
