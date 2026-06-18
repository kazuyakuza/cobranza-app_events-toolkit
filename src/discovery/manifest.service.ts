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

/** Generic callable type used for prototype method access. */
type AnyFunction = (...args: unknown[]) => unknown;

/** Parameters for resolving a payload schema reference from method metadata. */
interface PayloadSchemaRefParams {
  /** Class prototype that owns the method. */
  prototype: object;
  /** Name of the method to inspect. */
  methodName: string;
  /** Explicit schema reference override from decorator options. */
  explicitRef?: string;
  /** When true, prefer the return type over the first parameter type. */
  preferReturnType?: boolean;
}

/** Class names treated as generic wrappers and excluded from schema reference resolution. */
const GENERIC_WRAPPER_TYPES = new Set(['EventEnvelope', 'EventBase', 'Object']);

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

  /**
   * Builds a consume entry from @OnEvent decorator metadata on the given method.
   *
   * @returns The consume entry, or null if the method has no @OnEvent decorator.
   */
  private buildOnEventEntry(instance: object, methodName: string): ManifestConsumeEntry | null {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const metadata = this.deps.reflector.get<OnEventMetadata>(ON_EVENT_METADATA, methodRef);
    if (!metadata) return null;
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype: Object.getPrototypeOf(instance),
      methodName,
      explicitRef: metadata.payloadSchemaRef,
    });
    return this.entryBuilder.buildOnEventEntry(metadata, methodName, payloadSchemaRef);
  }

  /**
   * Builds a consume entry from @OnRequestReply decorator metadata on the given method.
   *
   * @returns The consume entry, or null if the method has no @OnRequestReply decorator.
   */
  private buildOnRequestReplyEntry(instance: object, methodName: string): ManifestConsumeEntry | null {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const metadata = this.deps.reflector.get<OnRequestReplyMetadata>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!metadata) return null;
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype: Object.getPrototypeOf(instance),
      methodName,
      explicitRef: metadata.payloadSchemaRef,
    });
    return this.entryBuilder.buildOnRequestReplyEntry(metadata, methodName, payloadSchemaRef);
  }

  /**
   * Builds a produce entry from @EmitEvent decorator metadata on the given method.
   *
   * @returns The produce entry, or null if the method has no @EmitEvent decorator.
   */
  private buildEmitEventEntry(instance: object, methodName: string): ManifestProduceEntry | null {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const metadata = this.deps.reflector.get<EmitEventMetadata>(EMIT_EVENT_METADATA, methodRef);
    if (!metadata) return null;
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype: Object.getPrototypeOf(instance),
      methodName,
      explicitRef: metadata.payloadSchemaRef,
      preferReturnType: true,
    });
    return this.entryBuilder.buildEmitEventEntry(metadata, methodName, payloadSchemaRef);
  }

  /**
   * Resolves the payload schema reference for a method.
   *
   * Uses the explicit ref if provided, otherwise derives from parameter or return type metadata.
   *
   * @returns The resolved schema reference string.
   */
  private extractPayloadSchemaRef(params: PayloadSchemaRefParams): string {
    if (params.explicitRef) {
      return params.explicitRef;
    }
    if (params.preferReturnType) {
      const returnTypeName = this.extractReturnTypeName(params.prototype, params.methodName);
      if (returnTypeName) {
        return returnTypeName;
      }
      return this.extractParamTypeName(params.prototype, params.methodName);
    }
    const paramTypeName = this.extractParamTypeName(params.prototype, params.methodName);
    if (paramTypeName) {
      return paramTypeName;
    }
    return this.extractReturnTypeName(params.prototype, params.methodName);
  }

  /** Extracts the class name of the first parameter type from TypeScript reflect metadata. */
  private extractParamTypeName(prototype: object, methodName: string): string {
    const paramTypes = Reflect.getMetadata('design:paramtypes', prototype, methodName);
    if (!paramTypes || paramTypes.length === 0) {
      return '';
    }
    return this.extractClassName(paramTypes[0]);
  }

  /** Extracts the class name of the return type from TypeScript reflect metadata. */
  private extractReturnTypeName(prototype: object, methodName: string): string {
    const returnType = Reflect.getMetadata('design:returntype', prototype, methodName);
    if (!returnType) {
      return '';
    }
    return this.extractClassName(returnType);
  }

  /** Extracts the class name from a type reference, filtering out generic wrapper types. */
  private extractClassName(type: unknown): string {
    if (typeof type !== 'function') {
      return '';
    }
    const name = (type as AnyFunction).name;
    if (!name || GENERIC_WRAPPER_TYPES.has(name)) {
      return '';
    }
    return name;
  }

  /** Returns all non-null provider and controller instances from the NestJS discovery service. */
  private getValidInstances(): object[] {
    const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
    return allWrappers
      .filter((w) => w.instance != null && typeof w.instance === 'object')
      .map((w) => w.instance as object);
  }
}
