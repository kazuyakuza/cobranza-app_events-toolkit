import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventHandler } from '../consumer.service';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyMetadata } from './on-request-reply.decorator';
import {
  ON_REQUEST_REPLY_EXPLORER_DEPS_TOKEN,
  OnRequestReplyExplorerDeps,
} from './on-request-reply-explorer-deps.interface';

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
    const methodRef = (target.prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    if (typeof methodRef !== 'function') return;
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;

    this.deps.requestReplyConsumerService.registerHandler({
      eventType: metadata.eventType,
      handler,
      companyId: metadata.companyId,
    });
  }
}
