import { ManifestEntryBase } from './manifest-entry-base.dto';

/** Discriminator type for event consumer entries. */
export type ConsumeEntryType = 'event' | 'request-reply';

/** A single consumed event or request-reply entry in the service manifest. */
export interface ManifestConsumeEntry extends ManifestEntryBase {
  /** Whether this entry comes from @OnEvent ('event') or @OnRequestReply ('request-reply'). */
  type: ConsumeEntryType;
}
