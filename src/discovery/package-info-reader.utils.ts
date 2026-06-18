import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Represents the service-relevant fields extracted from package.json. */
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
}

const UNKNOWN_SERVICE = { name: 'unknown', version: '0.0.0' };

/** Reads service-relevant fields from the nearest package.json. */
export function readPackageInfo(packageJsonPath?: string): PackageInfo {
  const resolvedPath = packageJsonPath ?? join(process.cwd(), 'package.json');
  if (!existsSync(resolvedPath)) {
    return UNKNOWN_SERVICE;
  }
  try {
    const raw = readFileSync(resolvedPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      name: typeof data.name === 'string' ? data.name : UNKNOWN_SERVICE.name,
      version: typeof data.version === 'string' ? data.version : UNKNOWN_SERVICE.version,
      description: typeof data.description === 'string' ? data.description : undefined,
    };
  } catch {
    return UNKNOWN_SERVICE;
  }
}
