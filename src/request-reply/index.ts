/**
 * @packageDocumentation
 * Request-reply module — synchronous request-reply and async fire-and-forget
 * patterns over NATS JetStream.
 */

export { RequestReplyService } from './request-reply.service';
export {
  RequestReplyConfig,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  RequestReplyDeps,
  NATS_CONNECTION_TOKEN,
  REQUEST_REPLY_CONFIG_TOKEN,
  REQUEST_REPLY_DEPS_TOKEN,
  resolveRequestReplyConfig,
  SendRequestOptions,
  SendRequestResult,
  BuildResponseEnvelopeOptions,
} from './request-reply.types';
