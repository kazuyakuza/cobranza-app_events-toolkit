import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DiscoveryService } from './discovery.service';
import { DISCOVERY_MODULE_OPTIONS } from './discovery-service-options.interface';
import type { DiscoveryModuleOptions } from './discovery.module';
import { ManifestService } from './manifest.service';
import { SchemaGenerator } from './utils/schema-generator';
import { DiscoveryEventPublisher } from './events/discovery-event-publisher.service';
import { ManifestContributor } from './manifest-contributor.interface';
import type { ServiceManifestDto } from './dto/service-manifest.dto';
import type { ManifestConsumeEntry } from './dto/manifest-consume-entry.dto';
import type { ManifestProduceEntry } from './dto/manifest-produce-entry.dto';
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

function createConsumeEntry(overrides: Partial<ManifestConsumeEntry> = {}): ManifestConsumeEntry {
  return {
    subject: 'company.*.test.v1',
    payloadSchemaRef: 'TestData',
    description: 'Test',
    version: '1',
    handler: 'handler',
    tags: [],
    payloadExample: {},
    type: 'event',
    ...overrides,
  };
}
function createProduceEntry(overrides: Partial<ManifestProduceEntry> = {}): ManifestProduceEntry {
  return {
    subject: 'company.{companyId}.test.v1',
    payloadSchemaRef: 'TestData',
    description: 'Test',
    version: '1',
    handler: 'emitter',
    tags: [],
    payloadExample: {},
    ...overrides,
  };
}

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let mockManifestService: jest.Mocked<ManifestService>;
  let mockSchemaGenerator: jest.Mocked<SchemaGenerator>;
  let mockEventPublisher: jest.Mocked<DiscoveryEventPublisher>;
  let moduleOptions: DiscoveryModuleOptions;

  function createBaseManifest(): ServiceManifestDto {
    return {
      name: moduleOptions.service.name,
      version: moduleOptions.service.version,
      description: '',
      instanceId: 'test-instance',
      consumes: [createConsumeEntry({ subject: 'company.*.base.v1', handler: 'baseHandler' })],
      produces: [createProduceEntry({ subject: 'company.{companyId}.base.v1', handler: 'baseEmitter' })],
    };
  }

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

  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('D1+D2: registerContributor and getManifest', () => {
    it('registers a contributor and returns merged manifest', () => {
      const contributor: ManifestContributor = {
        contributeConsumes: () => [createConsumeEntry({ subject: 'company.*.dynamic.v1' })],
        contributeProduces: () => [createProduceEntry({ subject: 'company.{companyId}.dynamic.v1' })],
      };
      service.registerContributor(contributor);
      const manifest = service.getManifest();
      expect(manifest.consumes).toHaveLength(2);
      expect(manifest.consumes[1].subject).toBe('company.*.dynamic.v1');
      expect(manifest.produces).toHaveLength(2);
      expect(manifest.produces[1].subject).toBe('company.{companyId}.dynamic.v1');
    });
  });

  describe('D3: onModuleInit', () => {
    it('generates manifest including contributors and calls schemaGenerator', () => {
      const contributor: ManifestContributor = {
        contributeConsumes: () => [createConsumeEntry({ subject: 'company.*.dynamic.v1' })],
        contributeProduces: () => [],
      };
      service.registerContributor(contributor);
      service.onModuleInit();
      expect(mockManifestService.generateManifest).toHaveBeenCalledTimes(1);
      expect(mockSchemaGenerator.generateSchemasForManifest).toHaveBeenCalledTimes(1);
      const manifestArg = mockSchemaGenerator.generateSchemasForManifest.mock.calls[0][0];
      expect(manifestArg.consumes).toHaveLength(2);
      expect(manifestArg.consumes[1].subject).toBe('company.*.dynamic.v1');
    });
  });

  describe('D4+D5: onModuleInit skips when disabled or registerOnStartup is false', () => {
    it('does nothing when enabled is false', () => {
      moduleOptions.enabled = false;
      service.onModuleInit();
      expect(mockSchemaGenerator.generateSchemasForManifest).not.toHaveBeenCalled();
    });

    it('does nothing when registerOnStartup is false', () => {
      moduleOptions.registerOnStartup = false;
      service.onModuleInit();
      expect(mockSchemaGenerator.generateSchemasForManifest).not.toHaveBeenCalled();
    });
  });

  describe('D6: getManifest() uses cached manifest', () => {
    it('does not regenerate manifest on second call', () => {
      const contributor: ManifestContributor = {
        contributeConsumes: () => [createConsumeEntry({ subject: 'company.*.dynamic.v1' })],
        contributeProduces: () => [],
      };
      service.registerContributor(contributor);
      const first = service.getManifest();
      const second = service.getManifest();
      expect(first).toBe(second);
      expect(mockManifestService.generateManifest).toHaveBeenCalledTimes(1);
    });
  });

  describe('D7: deduplication — decorator wins over contributor', () => {
    it('deduplicates consumes by subject+type with baseline winning', () => {
      const contributor: ManifestContributor = {
        contributeConsumes: () => [
          createConsumeEntry({ subject: 'company.*.base.v1', type: 'event', handler: 'contribHandler' }),
        ],
        contributeProduces: () => [
          createProduceEntry({ subject: 'company.{companyId}.base.v1', handler: 'contribEmitter' }),
        ],
      };
      service.registerContributor(contributor);
      const manifest = service.getManifest();
      const baseConsume = manifest.consumes.find((e) => e.subject === 'company.*.base.v1');
      expect(baseConsume?.handler).toBe('baseHandler');
      const baseProduce = manifest.produces.find((e) => e.subject === 'company.{companyId}.base.v1');
      expect(baseProduce?.handler).toBe('baseEmitter');
      expect(manifest.consumes).toHaveLength(1);
      expect(manifest.produces).toHaveLength(1);
    });
  });

  describe('D8: onApplicationBootstrap', () => {
    it('publishes registration with merged manifest', async () => {
      moduleOptions.registerOnStartup = true;
      moduleOptions.heartbeatIntervalMinutes = 0;
      const contributor: ManifestContributor = {
        contributeConsumes: () => [createConsumeEntry({ subject: 'company.*.dynamic.v1' })],
        contributeProduces: () => [],
      };
      service.registerContributor(contributor);
      await service.onApplicationBootstrap();
      expect(mockEventPublisher.publishRegistration).toHaveBeenCalledTimes(1);
      const manifestArg = mockEventPublisher.publishRegistration.mock.calls[0][0];
      expect(manifestArg.consumes).toHaveLength(2);
      expect(manifestArg.consumes[1].subject).toBe('company.*.dynamic.v1');
    });
  });
});
