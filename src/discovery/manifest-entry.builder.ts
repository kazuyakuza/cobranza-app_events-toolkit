import { OnEventMetadata } from '../consumer/decorators/on-event.decorator';
import { EmitEventMetadata } from '../producer/decorators/emit-event.decorator';
import { OnRequestReplyMetadata } from '../consumer/decorators/on-request-reply.decorator';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';

/** Placeholder token in producer subjects replaced with the actual company ID at runtime. */
const COMPANY_ID_PLACEHOLDER = '{companyId}';

/** Generic callable type used for prototype method access. */
type AnyFunction = (...args: unknown[]) => unknown;

/** Class names treated as generic wrappers and excluded from schema reference resolution. */
const GENERIC_WRAPPER_TYPES = new Set(['EventEnvelope', 'EventBase', 'Object']);

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

/**
 * Builds manifest entries from decorator metadata.
 *
 * Extracted from ManifestService to keep that class under the 200-line limit.
 */
export class ManifestEntryBuilder {
  /**
   * Builds a consume entry from @OnEvent decorator metadata.
   *
   * @returns The consume entry.
   */
  buildOnEventEntry(metadata: OnEventMetadata, methodName: string, prototype: object): ManifestConsumeEntry {
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype,
      methodName,
      explicitRef: metadata.payloadSchemaRef,
    });
    const version = metadata.version ?? '1';
    return {
      subject: `company.*.${metadata.eventType}.v${version}`,
      payloadSchemaRef,
      description: metadata.description ?? '',
      version,
      handler: methodName,
      tags: metadata.tags ?? [],
      payloadExample: metadata.payloadExample,
      type: 'event',
    };
  }

  /**
   * Builds a consume entry from @OnRequestReply decorator metadata.
   *
   * @returns The consume entry.
   */
  buildOnRequestReplyEntry(
    metadata: OnRequestReplyMetadata,
    methodName: string,
    prototype: object,
  ): ManifestConsumeEntry {
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype,
      methodName,
      explicitRef: metadata.payloadSchemaRef,
    });
    return {
      subject: metadata.eventType,
      payloadSchemaRef,
      description: metadata.description ?? '',
      version: '1',
      handler: methodName,
      tags: metadata.tags ?? [],
      payloadExample: metadata.payloadExample,
      type: 'request-reply',
    };
  }

  /**
   * Builds a produce entry from @EmitEvent decorator metadata.
   *
   * @returns The produce entry.
   */
  buildEmitEventEntry(metadata: EmitEventMetadata, methodName: string, prototype: object): ManifestProduceEntry {
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype,
      methodName,
      explicitRef: metadata.payloadSchemaRef,
      preferReturnType: true,
    });
    const version = metadata.version ?? '1';
    return {
      subject: `company.${COMPANY_ID_PLACEHOLDER}.${metadata.eventType}.v${version}`,
      payloadSchemaRef,
      description: metadata.description ?? '',
      version,
      handler: methodName,
      tags: metadata.tags ?? [],
      payloadExample: metadata.payloadExample,
    };
  }

  /**
   * Resolves the payload schema reference for a method.
   *
   * Uses the explicit ref if provided, otherwise derives from parameter or return type metadata.
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
}
