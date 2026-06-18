import { Inject, Injectable } from '@nestjs/common';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';
import { MANIFEST_SERVICE_DEPS_TOKEN, ManifestServiceDeps } from './manifest-deps.interface';
import { ServiceInfo } from './service-info.interface';
import { generateInstanceId } from './instance-id.utils';
import { ON_EVENT_METADATA, OnEventOptions } from '../consumer/decorators/on-event.decorator';
import { EMIT_EVENT_METADATA, EmitEventOptions } from '../producer/decorators/emit-event.decorator';
import { ON_REQUEST_REPLY_METADATA, OnRequestReplyOptions } from '../consumer/decorators/on-request-reply.decorator';

const COMPANY_ID_PLACEHOLDER = '{companyId}';

type AnyFunction = (...args: unknown[]) => unknown;

interface PayloadSchemaRefParams {
  prototype: object;
  methodName: string;
  explicitRef?: string;
  preferReturnType?: boolean;
}

const GENERIC_WRAPPER_TYPES = new Set(['EventEnvelope', 'EventBase', 'Object']);

@Injectable()
export class ManifestService {
  constructor(@Inject(MANIFEST_SERVICE_DEPS_TOKEN) private readonly deps: ManifestServiceDeps) {}

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

  private buildConsumeEntries(): ManifestConsumeEntry[] {
    const eventEntries = this.scanOnEventDecorators();
    const replyEntries = this.scanOnRequestReplyDecorators();
    return [...eventEntries, ...replyEntries];
  }

  private buildProduceEntries(): ManifestProduceEntry[] {
    return this.scanEmitEventDecorators();
  }

  private getMethodNames(instance: object): string[] {
    const methodNames: string[] = [];
    this.deps.metadataScanner.scanFromPrototype(instance, Object.getPrototypeOf(instance), (methodName) =>
      methodNames.push(methodName),
    );
    return methodNames;
  }

  private scanOnEventDecorators(): ManifestConsumeEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildOnEventEntry(instance, methodName))
        .filter((entry): entry is ManifestConsumeEntry => entry != null),
    );
  }

  private scanOnRequestReplyDecorators(): ManifestConsumeEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildOnRequestReplyEntry(instance, methodName))
        .filter((entry): entry is ManifestConsumeEntry => entry != null),
    );
  }

  private scanEmitEventDecorators(): ManifestProduceEntry[] {
    return this.getValidInstances().flatMap((instance) =>
      this.getMethodNames(instance)
        .map((methodName) => this.buildEmitEventEntry(instance, methodName))
        .filter((entry): entry is ManifestProduceEntry => entry != null),
    );
  }

  private buildOnEventEntry(instance: object, methodName: string): ManifestConsumeEntry | undefined {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const options = this.deps.reflector.get<OnEventOptions>(ON_EVENT_METADATA, methodRef);
    if (!options) return undefined;
    const version = options.version ?? '1';
    return {
      subject: `company.*.${options.domain}.${options.entity}.${options.action}.v${version}`,
      payloadSchemaRef: this.extractPayloadSchemaRef({
        prototype: Object.getPrototypeOf(instance),
        methodName,
        explicitRef: options.payloadSchemaRef,
      }),
      description: options.description ?? '',
      version,
      handler: methodName,
      tags: options.tags ?? [],
      type: 'event',
    };
  }

  private buildOnRequestReplyEntry(instance: object, methodName: string): ManifestConsumeEntry | undefined {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const options = this.deps.reflector.get<OnRequestReplyOptions>(ON_REQUEST_REPLY_METADATA, methodRef);
    if (!options) return undefined;
    return {
      subject: options.eventType,
      payloadSchemaRef: this.extractPayloadSchemaRef({
        prototype: Object.getPrototypeOf(instance),
        methodName,
        explicitRef: options.payloadSchemaRef,
      }),
      description: options.description ?? '',
      version: '1',
      handler: methodName,
      tags: options.tags ?? [],
      type: 'request-reply',
    };
  }

  private buildEmitEventEntry(instance: object, methodName: string): ManifestProduceEntry | undefined {
    const methodRef = (Object.getPrototypeOf(instance) as Record<string, AnyFunction>)[methodName];
    const options = this.deps.reflector.get<EmitEventOptions>(EMIT_EVENT_METADATA, methodRef);
    if (!options) return undefined;
    const version = options.version ?? '1';
    return {
      subject: `company.${COMPANY_ID_PLACEHOLDER}.${options.domain}.${options.entity}.${options.action}.v${version}`,
      payloadSchemaRef: this.extractPayloadSchemaRef({
        prototype: Object.getPrototypeOf(instance),
        methodName,
        explicitRef: options.payloadSchemaRef,
        preferReturnType: true,
      }),
      description: options.description ?? '',
      version,
      handler: methodName,
      tags: options.tags ?? [],
    };
  }

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

  private extractParamTypeName(prototype: object, methodName: string): string {
    const paramTypes = Reflect.getMetadata('design:paramtypes', prototype, methodName);
    if (!paramTypes || paramTypes.length === 0) {
      return '';
    }
    return this.extractClassName(paramTypes[0]);
  }

  private extractReturnTypeName(prototype: object, methodName: string): string {
    const returnType = Reflect.getMetadata('design:returntype', prototype, methodName);
    if (!returnType) {
      return '';
    }
    return this.extractClassName(returnType);
  }

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

  private getValidInstances(): object[] {
    const allWrappers = [...this.deps.discovery.getProviders(), ...this.deps.discovery.getControllers()];
    return allWrappers
      .filter((w) => w.instance != null && typeof w.instance === 'object')
      .map((w) => w.instance as object);
  }
}
