import { Injectable, Inject, OnModuleInit, Optional } from '@nestjs/common';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import { DiscoveryModuleOptions } from './discovery.module';
import { EventLoggerService } from '../logging/event-logger.service';

@Injectable()
export class DiscoveryService implements OnModuleInit {
  private readonly resolvedOptions: DiscoveryModuleOptions;
  private readonly logger: EventLoggerService;

  constructor(
    @Inject(DISCOVERY_MODULE_OPTIONS) options: DiscoveryModuleOptions,
    @Optional() logger: EventLoggerService,
  ) {
    this.resolvedOptions = options;
    this.logger = logger ?? new EventLoggerService();
  }

  onModuleInit(): void {
    if (!this.resolvedOptions.enabled) {
      return;
    }
    if (!this.resolvedOptions.registerOnStartup) {
      return;
    }
    this.logger.logEventEmitted({
      eventId: 'discovery-startup',
      eventType: 'discovery.service.initialized',
      subject: 'discovery.lifecycle',
    });
  }
}
