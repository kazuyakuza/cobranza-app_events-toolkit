import { Inject, Injectable } from '@nestjs/common';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';
import { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';
import { ServiceInfo } from './service-info.interface';
import { generateInstanceId } from './instance-id.utils';
import { ON_EVENT_METADATA, OnEventMetadata } from '../consumer/decorators/on-event.decorator';
import { EMIT_EVENT_METADATA, EmitEventMetadata } from '../producer/decorators/emit-event.decorator';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyMetadata } from '../consumer/decorators/on-request-reply.decorator';
import { ManifestEntryBuilder } from './manifest-entry.builder';

/**
 * Scans NestJS providers and controllers for event decorator metadata
 * and assembles a {@link ServiceManifestDto} describing the service's event contract.
 */
@Injectable()
export class ManifestService {
  private readonly entryBuilder = new ManifestEntryBuilder();

  constructor(@Inject(MANIFEST_SERVICE_DEPS_TOKEN) private readonly deps: ManifestServiceDeps) {}

  /**
   * Generates the complete service manifest from decorator metadata.
   *
   * @param serviceInfo - Service identity metadata (name, version, description, instanceId).
   * @returns Fully populated service manifest DTO.
   */
  generateManifest(serviceInfo: ServiceInfo): ServiceManifestDto {
    const consumes = this.buildConsumeEntries();
    const produces = this.buildProduceEntries();
    return {
      name: serviceInfo.name,
      version: serviceInfo.version,
      description: serviceInfo.description ?? '',
      instanceId: serviceInfo.instanceId ?? generateInstanceId(),
      consumes,
      produces,
    };
  }

  /** Builds all consume entries by scanning @OnEvent and @OnRequestReply decorators. */
  private buildConsumeEntries(): ManifestConsumeEntry[] {
    const eventEntries = this.scanOnEventDecorators();
    const replyEntries = this.scanOnRequestReplyDecorators();
    return [...eventEntries, ...replyEntries];
  }

  /** Builds all produce entries by scanning @EmitEvent decorators. */
  private buildProduceEntries(): ManifestProduceEntry[] {
    return this.scanEmitEventDecorators();
  }

  /** Returns all method names defined on the given instance's prototype. */
  private getMethodNames(instance: object): string[] {
    const methodNames: string[] = [];
    this.deps.metadataScanner.scanFromPrototype(instance, Object.getPrototypeOf(instance), (methodName) =>
      methodNames.push(methodName),
    );
    return methodNames;
  }

  /** Scans all valid instances for @OnEvent decorator metadata and builds consume entries. */
  private scanOnEventDecorators(): ManifestConsumeEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildOnEventEntry(instance, methodName))
        .filter((entry): entry is ManifestConsumeEntry => entry != null),
    );
  }

  /** Scans all valid instances for @OnRequestReply decorator metadata and builds consume entries. */
  private scanOnRequestReplyDecorators(): ManifestConsumeEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildOnRequestReplyEntry(instance, methodName))
        .filter((entry): entry is ManifestConsumeEntry => entry != null),
    );
  }

  /** Scans all valid instances for @EmitEvent decorator metadata and builds produce entries. */
  private scanEmitEventDecorators(): ManifestProduceEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildEmitEventEntry(instance, methodName))
        .filter((entry): entry is ManifestProduceEntry => entry != null),
    );
  }

  private buildOnEventEntry(instance: object, methodName: string): ManifestConsumeEntry | null {
    const prototype = Object.getPrototypeOf(instance);
    const methodRef = (prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return null;
    return this.entryBuilder.buildOnEventEntry(metadata, methodName, prototype);
  }

  private buildOnRequestReplyEntry(instance: object, methodName: string): ManifestConsumeEntry | null {
    const prototype = Object.getPrototypeOf(instance);
    const methodRef = (prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return null;
    return this.entryBuilder.buildOnRequestReplyEntry(metadata, methodName, prototype);
  }

  private buildEmitEventEntry(instance: object, methodName: string): ManifestProduceEntry | null {
    const prototype = Object.getPrototypeOf(instance);
    const methodRef = (prototype as Record<string, (...args: unknown[]) => unknown>)[methodName];
    const metadata = this.deps.reflector.get<EmitEventMetadata>(EMIT_EVENT_METADATA, methodRef);
    if (!metadata) return null;
    return this.entryBuilder.buildEmitEventEntry(metadata, methodName, prototype);
  }

  /** Returns all non-null provider and controller instances from the NestJS discovery service. */
  private getValidInstances(): object[] {
    const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
    return allWrappers
      .filter((w) => w.instance != null && typeof w.instance === 'object')
      .map((w) => w.instance as object);
  }
}
