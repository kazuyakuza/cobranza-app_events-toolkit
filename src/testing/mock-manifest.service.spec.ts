import { MockManifestService } from './mock-manifest.service';
import { ServiceInfo } from '../discovery/service-info.interface';
import { ServiceManifestDto } from '../discovery/dto/service-manifest.dto';

describe('MockManifestService', () => {
  let service: MockManifestService;
  const defaultServiceInfo: ServiceInfo = {
    name: 'test-service',
    version: '1.0.0',
  };

  beforeEach(() => {
    service = new MockManifestService();
  });

  it('generates a minimal manifest from ServiceInfo', () => {
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('');
    expect(manifest.consumes).toEqual([]);
    expect(manifest.produces).toEqual([]);
  });

  it('uses description from serviceInfo when provided', () => {
    const info: ServiceInfo = {
      name: 'svc',
      version: '2.0.0',
      description: 'A test service',
    };
    const manifest = service.generateManifest(info);
    expect(manifest.description).toBe('A test service');
  });

  it('uses provided instanceId when available', () => {
    const info: ServiceInfo = {
      name: 'svc',
      version: '1.0.0',
      instanceId: 'inst-123',
    };
    const manifest = service.generateManifest(info);
    expect(manifest.instanceId).toBe('inst-123');
  });

  it('returns the configured default manifest when set', () => {
    const configured: ServiceManifestDto = {
      name: 'custom',
      version: '3.0.0',
      description: 'Custom',
      instanceId: 'inst-456',
      consumes: [],
      produces: [],
    };
    service.setDefaultManifest(configured);
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest).toEqual(configured);
  });

  it('clearDefaultManifest restores auto-generation', () => {
    service.setDefaultManifest({
      name: 'x',
      version: '1',
      description: '',
      instanceId: 'i1',
      consumes: [],
      produces: [],
    });
    service.clearDefaultManifest();
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
  });

  it('clear resets all state', () => {
    service.setDefaultManifest({
      name: 'x',
      version: '1',
      description: '',
      instanceId: 'i1',
      consumes: [],
      produces: [],
    });
    service.clear();
    const manifest = service.generateManifest(defaultServiceInfo);
    expect(manifest.name).toBe('test-service');
  });
});
