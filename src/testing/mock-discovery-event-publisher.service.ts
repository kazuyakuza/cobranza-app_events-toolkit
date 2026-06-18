import { Injectable } from '@nestjs/common';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';
import { ServiceHeartbeatPayload } from '../discovery/events/discovery-payloads.interface';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { generateEventId, generateUuidV7 } from '../common/utils/uuid.utils';
import { nowIso } from '../common/utils/date.utils';
import { ActorType } from '../common/envelope/actor-type.enum';
import {
  PLATFORM_REGISTER_SUBJECT,
  PLATFORM_HEARTBEAT_SUBJECT,
  PLATFORM_SHUTDOWN_SUBJECT,
} from '../discovery/events/platform-event-subjects';
import { PlatformEventType } from '../discovery/events/platform-event-types';
import { PLATFORM_COMPANY_ID, PLATFORM_ACTOR_ID } from '../discovery/events/discovery-payloads.interface';
import { MockProducerService } from './mock-producer.service';

/** Parameters for building a platform event envelope. */
interface PlatformEnvelopeParams {
  /** Event type string. */
  eventType: string;
  /** Producer service name from the manifest. */
  producerName: string;
  /** Domain-specific payload. */
  data: unknown;
}

/**
 * In-memory mock for DiscoveryEventPublisher.
 *
 * Publishes platform discovery events through MockProducerService so tests
 * can capture and assert on registration, heartbeat, and shutdown events.
 */
@Injectable()
export class MockDiscoveryEventPublisher {
  private includeFullManifestInHeartbeat = false;

  constructor(private readonly producer: MockProducerService) {}

  /** Sets whether to include the full manifest in heartbeat payloads. */
  setIncludeFullManifestInHeartbeat(value: boolean): void {
    this.includeFullManifestInHeartbeat = value;
  }

  /** Publishes a platform.service.register.v1 event carrying the full service manifest. */
  async publishRegistration(manifest: ServiceManifestDto): Promise<void> {
    const envelope = this.buildEnvelope({
      eventType: PlatformEventType.REGISTER,
      producerName: manifest.name,
      data: manifest,
    });
    await this.producer.publish(PLATFORM_REGISTER_SUBJECT, envelope);
  }

  /** Publishes a platform.service.heartbeat.v1 liveness event. */
  async publishHeartbeat(manifest: ServiceManifestDto): Promise<void> {
    const payload: ServiceHeartbeatPayload = {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
    if (this.includeFullManifestInHeartbeat) {
      payload.manifest = manifest;
    }
    const envelope = this.buildEnvelope({
      eventType: PlatformEventType.HEARTBEAT,
      producerName: manifest.name,
      data: payload,
    });
    await this.producer.publish(PLATFORM_HEARTBEAT_SUBJECT, envelope);
  }

  /** Publishes a platform.service.shutdown.v1 graceful-shutdown event. */
  async publishShutdown(manifest: ServiceManifestDto): Promise<void> {
    const payload = {
      name: manifest.name,
      version: manifest.version,
      instanceId: manifest.instanceId,
      timestamp: nowIso(),
    };
    const envelope = this.buildEnvelope({
      eventType: PlatformEventType.SHUTDOWN,
      producerName: manifest.name,
      data: payload,
    });
    await this.producer.publish(PLATFORM_SHUTDOWN_SUBJECT, envelope);
  }

  private buildEnvelope(params: PlatformEnvelopeParams): EventEnvelope<unknown> {
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
}
