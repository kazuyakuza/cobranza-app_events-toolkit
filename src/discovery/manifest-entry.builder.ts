import { OnEventMetadata } from '../consumer/decorators/on-event.decorator';
import { EmitEventMetadata } from '../producer/decorators/emit-event.decorator';
import { OnRequestReplyMetadata } from '../consumer/decorators/on-request-reply.decorator';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';

/** Placeholder token in producer subjects replaced with the actual company ID at runtime. */
const COMPANY_ID_PLACEHOLDER = '{companyId}';

/**
 * Builds manifest entries from decorator metadata.
 *
 * Extracted from ManifestService to keep that class under the 200-line limit.
 */
export class ManifestEntryBuilder {
  /**
   * Builds a consume entry from @OnEvent decorator metadata.
   *
   * @returns The consume entry, or null if metadata is missing.
   */
  buildOnEventEntry(metadata: OnEventMetadata, methodName: string, payloadSchemaRef: string): ManifestConsumeEntry {
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
   * @returns The consume entry, or null if metadata is missing.
   */
  buildOnRequestReplyEntry(
    metadata: OnRequestReplyMetadata,
    methodName: string,
    payloadSchemaRef: string,
  ): ManifestConsumeEntry {
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
   * @returns The produce entry, or null if metadata is missing.
   */
  buildEmitEventEntry(metadata: EmitEventMetadata, methodName: string, payloadSchemaRef: string): ManifestProduceEntry {
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
}
