import { Controller, Get } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SchemaGenerator } from './utils/schema-generator';
import { ServiceManifestDto } from './dto/service-manifest.dto';
import { SchemaCollection } from './utils/schema-types.interface';

@Controller('discovery')
export class DiscoveryController {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly schemaGenerator: SchemaGenerator,
  ) {}

  @Get('manifest')
  getManifest(): ServiceManifestDto {
    return this.discoveryService.getManifest();
  }

  @Get('schemas')
  getSchemas(): SchemaCollection {
    return this.schemaGenerator.getAllSchemas();
  }
}
