/**
 * @packageDocumentation
 * Request-reply module — synchronous request-reply pattern over NATS.
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
} from './request-reply.types';
