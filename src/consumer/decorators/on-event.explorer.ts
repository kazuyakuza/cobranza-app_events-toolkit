import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventHandler } from '../consumer.service';
import { ON_EVENT_METADATA, OnEventOptions } from './on-event.decorator';
import { ON_EVENT_EXPLORER_DEPS_TOKEN, OnEventExplorerDeps } from './on-event-explorer-deps.interface';

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
 * Builds a wildcard NATS subject (company.*) for each handler registration.
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
  constructor(@Inject(ON_EVENT_EXPLORER_DEPS_TOKEN) private readonly deps: OnEventExplorerDeps) { }

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

  private isValidWrapper(wrapper: { instance?: unknown; }): boolean {
    return this.hasObjectInstance(wrapper);
  }

  private hasObjectInstance(wrapper: { instance?: unknown; }): boolean {
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
    const options = this.deps.reflector.get<OnEventOptions>(ON_EVENT_METADATA, methodRef);
    if (!options) return;

    const handler = (target.instance as Record<string, (...args: unknown[]) => unknown>)[methodName].bind(
      target.instance,
    ) as EventHandler;
    const subject = this.buildWildcardSubject(options);
    this.deps.consumerService.registerHandler(subject, handler);
  }

  private buildWildcardSubject(options: OnEventOptions): string {
    const version = options.version ?? '1';
    return `company.*.${options.domain}.${options.entity}.${options.action}.v${version}`;
  }
}
