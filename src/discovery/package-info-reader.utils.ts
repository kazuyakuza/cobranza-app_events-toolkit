import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Represents the service-relevant fields extracted from package.json. */
export interface PackageInfo {
  /** Service name from package.json. */
  name: string;
  /** Service version from package.json. */
  version: string;
  /** Human-readable description from package.json. */
  description?: string;
}

/** Fallback service info when package.json is missing or unreadable. */
const UNKNOWN_SERVICE = Object.freeze({ name: 'unknown', version: '0.0.0' });

/**
 * Reads service-relevant fields from the nearest package.json.
 *
 * @param packageJsonPath - Optional explicit path to package.json.
 *                          Defaults to `<cwd>/package.json`.
 * @returns Parsed package info, or fallback values if the file is
 *          missing, unreadable, or lacks the expected fields.
 */
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
