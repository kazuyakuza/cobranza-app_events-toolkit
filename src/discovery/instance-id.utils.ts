import { randomUUID } from 'crypto';

/** Generates a unique instance identifier for the service manifest. */
export function generateInstanceId(): string {
  return `inst_${randomUUID().replace(/-/g, '')}`;
}
