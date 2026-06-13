// ── Constants ──
export { EVENT_ID_PREFIX, LIBRARY_VERSION, DEFAULT_SUBJECT_VERSION } from './common/constants';

// ── Envelope ──
export { EventEnvelope } from './common/envelope/event-envelope.class';
export { EventBase } from './common/envelope/event-base.class';
export { ActorType } from './common/envelope/actor-type.enum';
export { EventContext } from './common/envelope/event-context.interface';

// ── DTOs ──
export { BuildSubjectDto } from './common/dto/build-subject.dto';

// ── Utils ──
export { SubjectBuilder, buildSubject } from './common/utils/subject.builder';
export { generateUuidV7, generateEventId } from './common/utils/uuid.utils';
export { nowIso } from './common/utils/date.utils';
export { encodeEvent, decodeEvent } from './common/utils/serialization.utils';

// ── Errors ──
export { EventConsumerException, EventConsumerExceptionOptions } from './common/errors/event-consumer.exception';
export { RequestReplyException, RequestReplyExceptionOptions } from './common/errors/request-reply.exception';

// ── Logging ──
export {
  EventLoggerService,
  EventLoggerOptions,
  EventLogContext,
  EventErrorLogContext,
} from './logging/event-logger.service';

// ── Producer ──
export { ProducerService, EmitOptions } from './producer/producer.service';
export {
  ProducerModule,
  JETSTREAM_TOKEN,
  ProducerModuleOptions,
  ProducerModuleAsyncOptions,
} from './producer/producer.module';
export { EmitEvent, EMIT_EVENT_METADATA, EmitEventOptions } from './producer/decorators/emit-event.decorator';
export { EmitEventInterceptor } from './producer/decorators/emit-event-interceptor';

// ── Consumer ──
export { ConsumerService, EventHandler } from './consumer/consumer.service';
export { JetStreamConsumerService } from './consumer/jetstream-consumer.service';
export {
  ConsumerModule,
  CONSUMER_MODULE_OPTIONS,
  ConsumerModuleOptions,
  ConsumerModuleAsyncOptions,
} from './consumer/consumer.module';
export { OnEvent, ON_EVENT_METADATA, OnEventOptions } from './consumer/decorators/on-event.decorator';
export { OnEventExplorer } from './consumer/decorators/on-event.explorer';
export {
  ON_EVENT_EXPLORER_DEPS_TOKEN,
  OnEventExplorerDeps,
} from './consumer/decorators/on-event-explorer-deps.interface';
export { DispatchOptions } from './consumer/dispatch-options.interface';
export {
  SubscribeOptions,
  ConsumerSubscribeOpts,
  defaultDlqSubjectBuilder,
  envelopeToContext,
} from './consumer/subscribe-options.interface';
export { JetStreamConsumerDeps, JETSTREAM_CONSUMER_DEPS_TOKEN } from './consumer/jetstream-consumer-deps.interface';

// ── Request-Reply ──
export { RequestReplyService } from './request-reply/request-reply.service';
export {
  RequestReplyConfig,
  RequestReplyRequestOptions,
  RequestReplyResponse,
  RequestReplyDeps,
  NATS_CONNECTION_TOKEN,
  REQUEST_REPLY_CONFIG_TOKEN,
  REQUEST_REPLY_DEPS_TOKEN,
  resolveRequestReplyConfig,
} from './request-reply/request-reply.types';
