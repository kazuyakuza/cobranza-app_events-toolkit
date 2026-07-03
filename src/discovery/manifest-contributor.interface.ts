import { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';

/**
 * Extension point for services that register event handlers dynamically at runtime.
 *
 * Implement this interface when your service needs to add event subjects to the
 * discovery manifest that are not known at compile time (e.g., generic CRUD gateways,
 * dynamic subscription managers).
 *
 * ## Usage
 *
 * 1. Implement `ManifestContributor` on your injectable class.
 * 2. Inject `DiscoveryService` and call `registerContributor(this)` in the constructor.
 * 3. Return dynamic entries from `contributeConsumes()` and `contributeProduces()`.
 *
 * ## Lifecycle
 *
 * - Contributors are registered during construction (before any lifecycle hook).
 * - Entries are collected during `DiscoveryService.onModuleInit()` when the manifest
 *   is generated, **after** decorator-scanned baseline entries are built.
 * - Contributor entries participate in schema generation and are included in the
 *   `platform.service.register.v1` event payload.
 *
 * ## Deduplication
 *
 * - Produces: deduplicated by `subject`. Baseline entries win.
 * - Consumes: deduplicated by composite key `subject|type`. Baseline entries win.
 * - Among contributors, earlier-registered contributors win on collision.
 *
 * @see {@link ../../docs/examples/manifest-contributor.example.ts} for a complete example.
 * @see {@link DiscoveryService.registerContributor}
 */
export interface ManifestContributor {
  /**
   * Returns consume entries to add to the discovery manifest.
   *
   * Each entry should follow the same shape as `ManifestConsumeEntry` produced by
   * `@OnEvent` / `@OnRequestReply` decorators. Entries that collide with baseline
   * (decorator-scanned) entries by `subject|type` are silently dropped.
   */
  contributeConsumes(): ManifestConsumeEntry[];

  /**
   * Returns produce entries to add to the discovery manifest.
   *
   * Each entry should follow the same shape as `ManifestProduceEntry` produced by
   * `@EmitEvent` decorators. Entries that collide with baseline (decorator-scanned)
   * entries by `subject` are silently dropped.
   */
  contributeProduces(): ManifestProduceEntry[];
}
