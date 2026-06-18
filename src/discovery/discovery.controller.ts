import { Controller, Get } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { SchemaCollection } from './utils/schema-types.interface';

/** HTTP controller exposing discovery endpoints for manifest and schema retrieval. */
@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly schemaGenerator: SchemaGenerator,
  ) {}

  /** Returns the cached service manifest with identity and event metadata. */
  @Get('manifest')
  getManifest(): ServiceManifestDto {
    return this.discoveryService.getManifest();
  }

  /** Returns all generated JSON Schemas keyed by event type. */
  @Get('schemas')
  getSchemas(): SchemaCollection {
    return this.schemaGenerator.getAllSchemas();
  }
}
