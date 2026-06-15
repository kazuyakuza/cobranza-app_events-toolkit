/**
 * @packageDocumentation
 * Consumer module — JetStream event consumption, decorators, and subscription configuration.
 */

export { ConsumerService, EventHandler } from './consumer.service';
export { JetStreamConsumerService } from './jetstream-consumer.service';
export {
  ConsumerModule,
  CONSUMER_MODULE_OPTIONS,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
} from './consumer.module';
export { OnEvent, ON_EVENT_METADATA, OnEventOptions } from './decorators/on-event.decorator';
export { OnEventExplorer } from './decorators/on-event.explorer';
export { ON_EVENT_EXPLORER_DEPS_TOKEN, OnEventExplorerDeps } from './decorators/on-event-explorer-deps.interface';
export { DispatchOptions } from './dispatch-options.interface';
export {
  SubscribeOptions,
  ConsumerSubscribeOpts,
  defaultDlqSubjectBuilder,
  envelopeToContext,
} from './subscribe-options.interface';
export { JetStreamConsumerDeps, JETSTREAM_CONSUMER_DEPS_TOKEN } from './jetstream-consumer-deps.interface';
export {
  OnRequestReply,
  ON_REQUEST_REPLY_METADATA,
  OnRequestReplyOptions,
} from './decorators/on-request-reply.decorator';
export { OnRequestReplyExplorer } from './decorators/on-request-reply.explorer';
export {
  ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
  OnRequestReplyExplorerDeps,
} from './decorators/on-request-reply-explorer-deps.interface';
export { RequestReplyConsumerService } from './request-reply-consumer.service';
export { REQUEST_REPLY_CONSUMER_DEPS_TOKEN, RequestReplyConsumerDeps } from './request-reply-consumer-deps.interface';
export { RegisterHandlerOptions } from './register-handler-options.interface';
