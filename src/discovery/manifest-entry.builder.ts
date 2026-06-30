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
   * @param metadata - Stored metadata from the @OnEvent decorator.
   * @param methodName - Name of the decorated handler method.
   * @param prototype - Class prototype that owns the handler method.
   * @returns The consume entry for the discovery manifest.
   */
  buildOnEventEntry(metadata: OnEventMetadata, methodName: string, prototype: object): ManifestConsumeEntry {
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype,
      methodName,
      explicitRef: metadata.payloadSchemaRef,
    });
    return {
      subject: `company.*.${metadata.eventType}.v${metadata.version}`,
      payloadSchemaRef,
      description: metadata.description,
      version: metadata.version,
      handler: methodName,
      tags: metadata.tags ?? [],
      payloadExample: metadata.payloadExample,
      type: 'event',
    };
  }

  /**
   * Builds a consume entry from @OnRequestReply decorator metadata.
   *
   * @param metadata - Stored metadata from the @OnRequestReply decorator.
   * @param methodName - Name of the decorated handler method.
   * @param prototype - Class prototype that owns the handler method.
   * @returns The consume entry for the discovery manifest.
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
      description: metadata.description,
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
   * @param metadata - Stored metadata from the @EmitEvent decorator.
   * @param methodName - Name of the decorated emitter method.
   * @param prototype - Class prototype that owns the emitter method.
   * @returns The produce entry for the discovery manifest.
   */
  buildEmitEventEntry(metadata: EmitEventMetadata, methodName: string, prototype: object): ManifestProduceEntry {
    const payloadSchemaRef = this.extractPayloadSchemaRef({
      prototype,
      methodName,
      explicitRef: metadata.payloadSchemaRef,
      preferReturnType: true,
    });
    return {
      subject: `company.${COMPANY_ID_PLACEHOLDER}.${metadata.eventType}.v${metadata.version}`,
      payloadSchemaRef,
      description: metadata.description,
      version: metadata.version,
      handler: methodName,
      tags: metadata.tags ?? [],
      payloadExample: metadata.payloadExample,
    };
  }

  /**
   * Resolves the payload schema reference for a method.
   *
   * Uses the explicit ref if provided, otherwise derives from parameter or return type metadata.
   *
   * @param params - Resolution parameters including prototype, method name, and optional overrides.
   * @returns The resolved schema reference string, or empty string if none found.
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
