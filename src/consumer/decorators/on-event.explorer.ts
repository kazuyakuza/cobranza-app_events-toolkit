import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { ConsumerService, EventHandler } from '../consumer.service';
import { ON_EVENT_METADATA, OnEventOptions } from './on-event.decorator';

/**
 * Scans all providers and controllers for @OnEvent() decorated methods
 * at module initialization and registers them with ConsumerService.
 *
 * Uses NestJS DiscoveryService to find all provider and controller instances,
 * then uses Reflector to read OnEvent metadata from their methods.
 * Builds a wildcard NATS subject (company.*) for each handler registration.
 *
 * Must be provided by ConsumerModule for automatic handler discovery.
 */
@Injectable()
export class OnEventExplorer implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly consumerService: ConsumerService,
  ) {}

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
    const allWrappers = [
      ...this.discovery.getProviders(),
      ...this.discovery.getControllers(),
    ];
    return allWrappers
      .filter((w) => this.isValidWrapper(w))
      .map((w) => w.instance as object);
  }

  private isValidWrapper(wrapper: { instance?: unknown; isDependencyMetStatic?: boolean }): boolean {
    return wrapper.instance != null && typeof wrapper.instance === 'object';
  }

  private registerInstanceHandlers(instance: object): void {
    const prototype = Object.getPrototypeOf(instance);
    const methodNames = Object.getOwnPropertyNames(prototype);
    for (const methodName of methodNames) {
      if (methodName === 'constructor') continue;
      this.tryRegisterHandler(instance, prototype, methodName);
    }
  }

  private tryRegisterHandler(instance: object, prototype: object, methodName: string): void {
    const methodRef = (prototype as Record<string, Function>)[methodName];
    const options = this.reflector.get<OnEventOptions>(ON_EVENT_METADATA, methodRef);
    if (!options) return;

    const handler = ((instance as Record<string, Function>)[methodName]).bind(instance) as EventHandler;
    const subject = this.buildWildcardSubject(options);
    this.consumerService.registerHandler(subject, handler);
  }

  private buildWildcardSubject(options: OnEventOptions): string {
    const version = options.version ?? '1';
    return `company.*.${options.domain}.${options.entity}.${options.action}.v${version}`;
  }
}