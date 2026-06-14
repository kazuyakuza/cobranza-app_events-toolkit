/**
 * @packageDocumentation
 * Producer module — event emission service, decorators, and interceptor.
 */

export { ProducerService, EmitOptions } from './producer.service';
export { ProducerModule, JETSTREAM_TOKEN, ProducerModuleOptions, ProducerModuleAsyncOptions } from './producer.module';
export { EmitEvent, EMIT_EVENT_METADATA, EmitEventOptions } from './decorators/emit-event.decorator';
export { EmitEventInterceptor } from './decorators/emit-event-interceptor';
