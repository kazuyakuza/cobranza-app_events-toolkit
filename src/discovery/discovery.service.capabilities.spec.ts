import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService } from './discovery.service';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import type { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
import type { ServiceManifestDto } from './dto/service-manifest.dto';

function createMockOptions(overrides: Partial<DiscoveryModuleOptions> = {}): DiscoveryModuleOptions {
  return {
    enabled: true,
    registerOnStartup: true,
    heartbeatIntervalMinutes: 0,
    includeFullManifestInHeartbeat: false,
    service: { name: 'test-service', version: '1.0.0' },
    schemaDir: '.events-toolkit/schemas',
    forceRegenerateSchemas: false,
    capabilities: [] as string[],
    ...overrides,
  };
}

function createBaseManifest(): ServiceManifestDto {
  return {
    name: 'test-service',
    version: '1.0.0',
    description: '',
    instanceId: 'test-instance',
    consumes: [],
    produces: [],
  };
}

describe('DiscoveryService capabilities', () => {
  let service: DiscoveryService;
  let mockManifestService: jest.Mocked<ManifestService>;
  let mockSchemaGenerator: jest.Mocked<SchemaGenerator>;
  let mockEventPublisher: jest.Mocked<DiscoveryEventPublisher>;
  let moduleOptions: DiscoveryModuleOptions;

  beforeEach(async () => {
    moduleOptions = createMockOptions();

    mockManifestService = {
      generateManifest: jest.fn().mockReturnValue(createBaseManifest()),
    } as unknown as jest.Mocked<ManifestService>;

    mockSchemaGenerator = {
      generateSchemasForManifest: jest.fn(),
    } as unknown as jest.Mocked<SchemaGenerator>;

    mockEventPublisher = {
      publishRegistration: jest.fn().mockResolvedValue(undefined),
      publishHeartbeat: jest.fn().mockResolvedValue(undefined),
      publishShutdown: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DiscoveryEventPublisher>;

    const testModule: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoveryService,
        { provide: DISCOVERY_MODULE_OPTIONS, useValue: moduleOptions },
        { provide: ManifestService, useValue: mockManifestService },
        { provide: SchemaGenerator, useValue: mockSchemaGenerator },
        { provide: DiscoveryEventPublisher, useValue: mockEventPublisher },
      ],
    }).compile();

    service = testModule.get(DiscoveryService);
  });

  it('includes capabilities on generated manifest', () => {
    moduleOptions.capabilities = ['idempotency', 'outbox'];
    const manifest = service.getManifest();
    expect(manifest.capabilities).toEqual(['idempotency', 'outbox']);
  });

  it('defaults capabilities to [] when unset', () => {
    moduleOptions.capabilities = [];
    const manifest = service.getManifest();
    expect(manifest.capabilities).toEqual([]);
  });
});
