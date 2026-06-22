import { Inject, Injectable, Optional } from '@nestjs/common';
import { ProducerService } from '../../producer/producer.service';
import { ServiceManifestDto } from '../dto/service-manifest.dto';
import { DiscoveryModuleOptions } from '../discovery.module';
import { DISCOVERY_MODULE_OPTIONS } from '../discovery-service-options.interface';
import { generateEventId, generateUuidV7 } from '../../common/utils/uuid.utils';
import { nowIso } from '../../common/utils/date.utils';
import { EventEnvelope } from '../../common/envelope/event-envelope.class';
import { ActorType } from '../../common/envelope/actor-type.enum';
import { PlatformEventType } from './platform-event-types';
import {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from './platform-event-subjects';
import {
  ServiceHeartbeatPayload,
  ServiceShutdownPayload,
  PLATFORM_COMPANY_ID,
  PLATFORM_ACTOR_ID,
} from './discovery-payloads.interface';

/** Parameters for building a platform event envelope. */
interface BuildPlatformEnvelopeParams {
  /** NATS subject to publish to. */
  subject: string;
  /** Domain-specific payload. */
  data: unknown;
  /** Event type string. */
  eventType: string;
  /** Producer service name from the manifest. */
  producerName: string;
}

/**
 * Publishes platform-level discovery events (register, heartbeat, shutdown)
 * via the NATS {@link ProducerService}.
 *
 * Falls back to silent no-op when no producer is available, ensuring
 * lifecycle hooks never fail due to missing infrastructure.
 */
@Injectable()
export class DiscoveryEventPublisher {
  constructor(
    @Optional() private readonly producerService: ProducerService | null,
    @Inject(DISCOVERY_MODULE_OPTIONS) private readonly options: DiscoveryModuleOptions,
  ) {}

  /** Publishes a `platform.service.register.v1` event carrying the full service manifest. */
  async publishRegistration(manifest: ServiceManifestDto): Promise<void> {
    const envelope = this.buildEnvelope({
      subject: PLATFORM_REGISTER_SUBJECT,
      data: manifest,
      eventType: PlatformEventType.REGISTER,
      producerName: manifest.name,
    });
    await this.publishOrLog(PLATFORM_REGISTER_SUBJECT, envelope);
  }

  /** Publishes a `platform.service.heartbeat.v1` liveness event. */
  async publishHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payload = this.buildHeartbeatPayload(manifest);
    const envelope = this.buildEnvelope({
      subject: PLATFORM_HEARTBEAT_SUBJECT,
      data: payload,
      eventType: PlatformEventType.HEARTBEAT,
      producerName: manifest.name,
    });
    await this.publishOrLog(PLATFORM_HEARTBEAT_SUBJECT, envelope);
  }

  /** Publishes a `platform.service.shutdown.v1` graceful-shutdown event. */
  async publishShutdown(manifest: ServiceManifestDto): Promise<void> {
    const payload = this.buildShutdownPayload(manifest);
    const envelope = this.buildEnvelope({
      subject: PLATFORM_SHUTDOWN_SUBJECT,
      data: payload,
      eventType: PlatformEventType.SHUTDOWN,
      producerName: manifest.name,
    });
    await this.publishOrLog(PLATFORM_SHUTDOWN_SUBJECT, envelope);
  }

  /** Builds the heartbeat payload, optionally embedding the full manifest. */
  private buildHeartbeatPayload(manifest: ServiceManifestDto): ServiceHeartbeatPayload {
    const payload: ServiceHeartbeatPayload = {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
    if (this.options.includeFullManifestInHeartbeat) {
      payload.manifest = manifest;
    }
    return payload;
  }

  /** Builds the shutdown payload from the service manifest. */
  private buildShutdownPayload(manifest: ServiceManifestDto): ServiceShutdownPayload {
    return {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
  }

  /** Wraps the payload in a standard {@link EventEnvelope} with platform actor metadata. */
  private buildEnvelope(params: BuildPlatformEnvelopeParams): EventEnvelope<unknown> {
    return new EventEnvelope<unknown>({
      id: generateEventId(),
      type: params.eventType,
      version: '1',
      produced_at: nowIso(),
      producer: params.producerName,
      company_id: PLATFORM_COMPANY_ID,
      actor_type: ActorType.SYSTEM,
      actor_id: PLATFORM_ACTOR_ID,
      correlation_id: generateUuidV7(),
      data: params.data,
    });
  }

  /** Publishes the envelope via the producer, or silently skips if unavailable. */
  private async publishOrLog(subject: string, envelope: EventEnvelope<unknown>): Promise<void> {
    if (!this.producerService) {
      return;
    }
    try {
      await this.producerService.publish(subject, envelope);
    } catch {
      // Best-effort: silent skip during lifecycle hooks
    }
  }
}
