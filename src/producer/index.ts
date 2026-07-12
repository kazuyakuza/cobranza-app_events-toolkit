/**
 * @packageDocumentation
 * Producer module — event emission service, decorators, and interceptor.
 */

export { ProducerService, EmitOptions } from './producer.service';
export { ProducerModule } from './producer.module';
export { JETSTREAM_TOKEN, ProducerModuleOptions, ProducerModuleAsyncOptions } from './producer.constants';
export { EmitEvent, EMIT_EVENT_METADATA, EmitEventOptions, EmitEventMetadata } from './decorators/emit-event.decorator';
export { EmitEventInterceptor } from './decorators/emit-event-interceptor';
