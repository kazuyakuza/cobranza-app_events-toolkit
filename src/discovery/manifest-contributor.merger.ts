import { ServiceManifestDto } from './dto/service-manifest.dto';
import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';
import { ManifestContributor } from './manifest-contributor.interface';

/**
 * Merges contributor entries into a base manifest while deduplicating.
 *
 * Called by `DiscoveryService` (and `MockDiscoveryService`) during manifest generation
 * to combine decorator-scanned baseline entries with dynamically contributed entries.
 *
 * Deduplication rules:
 * - Produces: deduplicated by `subject`. Baseline entries win.
 * - Consumes: deduplicated by composite key `subject|type`. Baseline entries win.
 * - Among contributor entries, earlier-registered contributors win on collision.
 *
 * @see {@link ../../docs/examples/manifest-contributor.example.ts}
 */
export class ManifestContributorMerger {
  /**
   * Merges entries from all registered contributors into the base manifest.
   *
   * @param baseManifest - Manifest generated from decorator scanning.
   * @param contributors - Registered manifest contributors.
   * @returns A new manifest with contributor entries merged and deduplicated.
   */
  merge(baseManifest: ServiceManifestDto, contributors: ManifestContributor[]): ServiceManifestDto {
    const contributorConsumes = this.collectContributorConsumes(contributors);
    const contributorProduces = this.collectContributorProduces(contributors);
    return {
      ...baseManifest,
      consumes: this.mergeConsumes(baseManifest.consumes, contributorConsumes),
      produces: this.mergeProduces(baseManifest.produces, contributorProduces),
    };
  }

  /** Collects all consume entries from registered contributors in registration order. */
  private collectContributorConsumes(contributors: ManifestContributor[]): ManifestConsumeEntry[] {
    return contributors.flatMap((c) => c.contributeConsumes());
  }

  /** Collects all produce entries from registered contributors in registration order. */
  private collectContributorProduces(contributors: ManifestContributor[]): ManifestProduceEntry[] {
    return contributors.flatMap((c) => c.contributeProduces());
  }

  /**
   * Merges contributed consume entries into the baseline, deduplicating by `subject|type`.
   * Baseline entries take priority; contributed entries with duplicate keys are skipped.
   */
  private mergeConsumes(baseline: ManifestConsumeEntry[], contributed: ManifestConsumeEntry[]): ManifestConsumeEntry[] {
    const existingKeys = new Set(baseline.map((e) => this.consumeKey(e)));
    const merged = [...baseline];
    for (const entry of contributed) {
      if (!existingKeys.has(this.consumeKey(entry))) {
        merged.push(entry);
        existingKeys.add(this.consumeKey(entry));
      }
    }
    return merged;
  }

  /**
   * Merges contributed produce entries into the baseline, deduplicating by `subject`.
   * Baseline entries take priority; contributed entries with duplicate subjects are skipped.
   */
  private mergeProduces(baseline: ManifestProduceEntry[], contributed: ManifestProduceEntry[]): ManifestProduceEntry[] {
    const existingKeys = new Set(baseline.map((e) => e.subject));
    const merged = [...baseline];
    for (const entry of contributed) {
      if (!existingKeys.has(entry.subject)) {
        merged.push(entry);
        existingKeys.add(entry.subject);
      }
    }
    return merged;
  }

  /** Builds the composite deduplication key for a consume entry: `subject|type`. */
  private consumeKey(entry: ManifestConsumeEntry): string {
    return `${entry.subject}|${entry.type}`;
  }
}
