import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventHandler } from '../consumer.service';
import { ON_EVENT_METADATA, OnEventMetadata } from './on-event.decorator';
import { ON_EVENT_EXPLORER_DEPS_TOKEN, OnEventExplorerDeps } from './on-event-explorer-deps.interface';
import { EventScope } from '../../common/envelope/event-scope.enum';
import type { IdempotencyService } from '../../idempotency/idempotency.service';

/** Pairs a class instance with its prototype for method metadata scanning. */
interface HandlerTarget {
  instance: object;
  prototype: object;
}

/**
 * Scans all providers and controllers for @OnEvent() decorated methods
 * at module initialization and registers them with ConsumerService.
 *
 * Uses NestJS DiscoveryService to find all provider and controller instances,
 * then uses Reflector to read OnEvent metadata from their methods.
 * Builds a wildcard NATS subject (company.* or global.*) for each handler registration.
 *
 * Note: This explorer only registers handlers with ConsumerService.
 * The host application is responsible for calling
 * JetStreamConsumerService.subscribe() to create NATS subscriptions
 * that route incoming messages to the registered handlers.
 *
 * Must be provided by ConsumerModule for automatic handler discovery.
 */
@Injectable()
export class OnEventExplorer implements OnModuleInit {
  constructor(@Inject(ON_EVENT_EXPLORER_DEPS_TOKEN) private readonly deps: OnEventExplorerDeps) {}

  /**
   * NestJS lifecycle hook — triggers handler discovery and registration at startup.
   */
  onModuleInit(): void {
    this.explore();
  }

  private explore(): void {
    const instances = this.getValidInstances();
    for (const instance of instances) {
      this.registerInstanceHandlers(instance);
    }
  }

  private getValidInstances(): object[] {
    const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
    return allWrappers.filter((w) => this.isValidWrapper(w)).map((w) => w.instance as object);
  }

  private isValidWrapper(wrapper: { instance?: unknown }): boolean {
    return this.hasObjectInstance(wrapper);
  }

  private hasObjectInstance(wrapper: { instance?: unknown }): boolean {
    return wrapper.instance != null && typeof wrapper.instance === 'object';
  }

  private registerInstanceHandlers(instance: object): void {
    const prototype = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(prototype);
    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;
      this.tryRegisterHandler({ instance, prototype }, methodName);
    }
  }

  private tryRegisterHandler(target: HandlerTarget, methodName: string): void {
    const descriptor = Object.getOwnPropertyDescriptor(target.prototype, methodName);
    if (!descriptor) return;
    if (typeof descriptor.value !== 'function') return;
    const methodRef = descriptor.value as (...args: unknown[]) => unknown;
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;
    const subject = this.buildWildcardSubject(metadata);
    const finalHandler = this.resolveHandler(handler, metadata);
    this.deps.consumerService.registerHandler(subject, finalHandler);
  }

  /** Returns the handler to register, wrapping it with idempotency when the
   *  decorator opted in and the idempotency service is available. */
  private resolveHandler(handler: EventHandler, metadata: OnEventMetadata): EventHandler {
    if (!metadata.idempotent) return handler;
    if (!this.deps.idempotencyService) return handler;
    return this.wrapWithIdempotency(handler, this.deps.idempotencyService);
  }

  /** Wraps a handler so duplicate events are skipped and processed events are marked. */
  private wrapWithIdempotency(handler: EventHandler, service: IdempotencyService): EventHandler {
    return async (event, context) => {
      if (await service.isDuplicate(event)) return;
      await handler(event, context);
      await service.markAsProcessed(event);
    };
  }

  private buildWildcardSubject(metadata: OnEventMetadata): string {
    if (metadata.scope === EventScope.GLOBAL) {
      return `global.${metadata.eventType}.v${metadata.version}`;
    }
    return `company.*.${metadata.eventType}.v${metadata.version}`;
  }
}
