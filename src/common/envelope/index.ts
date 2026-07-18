/**
 * @packageDocumentation
 * Event envelope types — base class, envelope wrapper, actor types, and event context.
 */

export { BaseEventEnvelope } from './base-event-envelope.class';
export { EventEnvelope } from './event-envelope.class';
export { GlobalEventEnvelope } from './global-event-envelope.class';
export { EventBase } from './event-base.class';
export { GlobalEventBase } from './global-event-base.class';
export { ActorType } from './actor-type.enum';
export { EventScope } from './event-scope.enum';
export { BaseEventContext } from './base-event-context.interface';
export { EventContext } from './event-context.interface';
export { GlobalEventContext } from './global-event-context.interface';
export { AnyEventEnvelope, AnyEventContext, isGlobalEnvelope, isGlobalContext } from './envelope-types';
export { IsOptionalForSystemActors } from './validators';
