import { ServiceInfo } from './service-info.interface';
import { ServiceInfoOverrides } from './service-info-overrides.interface';
import { readPackageInfo, PackageInfo } from './package-info-reader.utils';
import { generateInstanceId } from './instance-id.utils';

/**
 * Resolves service identity by merging package.json defaults with user overrides.
 *
 * Resolution order (highest to lowest priority):
 * 1. Explicit override values
 * 2. Values from package.json
 * 3. Generated instance ID (for `instanceId` field)
 *
 * @param overrides - Optional partial overrides for service identity fields.
 * @returns Fully resolved service identity ready for use in the service manifest.
 */
export function resolveServiceInfo(overrides?: ServiceInfoOverrides): ServiceInfo {
  const packageInfo: PackageInfo = readPackageInfo();
  return {
    name: overrides?.name ?? packageInfo.name,
    version: overrides?.version ?? packageInfo.version,
    description: overrides?.description ?? packageInfo.description,
    instanceId: overrides?.instanceId ?? generateInstanceId(),
  };
}
