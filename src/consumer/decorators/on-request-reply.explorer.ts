import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventHandler } from '../consumer.service';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyMetadata } from './on-request-reply.decorator';
import {
  ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
  OnRequestReplyExplorerDeps,
} from './on-request-reply-explorer-deps.interface';
import type { IdempotencyService } from '../../idempotency/idempotency.service';

/** Pairs a class instance with its prototype for method metadata scanning. */
interface HandlerTarget {
  instance: object;
  prototype: object;
}

/**
 * Scans all providers and controllers for @OnRequestReply() decorated methods
 * at module initialization and registers them with RequestReplyConsumerService.
 *
 * Uses NestJS DiscoveryService to find all provider and controller instances,
 * then uses Reflector to read OnRequestReply metadata from their methods.
 * Registers handlers keyed by eventType (with optional companyId filter).
 *
 * When a handler is decorated with `idempotent: true` and {@link IdempotencyService}
 * is available (i.e. `IdempotencyModule` is registered), the explorer wraps the handler
 * with a duplicate check: the event is skipped if already processed, otherwise the
 * handler runs and the event is marked as processed afterwards.
 *
 * Must be provided by ConsumerModule for automatic handler discovery.
 *
 * @see {@link OnRequestReply} for the decorator that this explorer reads.
 * @see {@link IdempotencyService} for the deduplication service used in idempotent wrapping.
 */
@Injectable()
export class OnRequestReplyExplorer implements OnModuleInit {
  constructor(@Inject(ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN) private readonly deps: OnRequestReplyExplorerDeps) {}

  /** NestJS lifecycle hook — triggers handler discovery and registration at startup. */
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
    return allWrappers.filter((w) => this.hasObjectInstance(w)).map((w) => w.instance as object);
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
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = methodRef.bind(target.instance) as EventHandler;
    const finalHandler = this.resolveHandler(handler, metadata);

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler: finalHandler,
      companyId: metadata.companyId,
    });
  }

  /**
   * Returns the handler to register, wrapping it with idempotency when the
   * decorator opted in and the idempotency service is available.
   *
   * Resolution order:
   * 1. If `metadata.idempotent` is falsy, returns the original handler unchanged.
   * 2. If `idempotencyService` is undefined (module not registered), returns the original handler.
   * 3. Otherwise, delegates to {@link wrapWithIdempotency}.
   *
   * @see {@link wrapWithIdempotency} for the wrapping implementation.
   */
  private resolveHandler(handler: EventHandler, metadata: OnRequestReplyMetadata): EventHandler {
    if (!metadata.idempotent) return handler;
    if (!this.deps.idempotencyService) return handler;
    return this.wrapWithIdempotency(handler, this.deps.idempotencyService);
  }

  /**
   * Wraps a handler so duplicate events are skipped and processed events are marked.
   *
   * The wrapped handler:
   * 1. Calls {@link IdempotencyService.isDuplicate} — returns early if `true`.
   * 2. Invokes the original handler.
   * 3. Calls {@link IdempotencyService.markAsProcessed} after the handler succeeds.
   *
   * If the handler throws, the event is **not** marked as processed, allowing retries.
   *
   * @see {@link IdempotencyService.executeIfNotProcessed} for the equivalent high-level API.
   */
  private wrapWithIdempotency(handler: EventHandler, service: IdempotencyService): EventHandler {
    return async (event, context) => {
      if (await service.isDuplicate(event)) return;
      await handler(event, context);
      await service.markAsProcessed(event);
    };
  }
}
