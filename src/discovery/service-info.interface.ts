/** Service identity metadata for inclusion in the service manifest. */
export interface ServiceInfo {
  /** Service name (e.g., 'payment-service'). */
  name: string;
  /** Service version (e.g., '1.0.0'). */
  version: string;
  /** Human-readable description of the service. */
  description?: string;
  /** Unique instance identifier. Auto-generated if not provided. */
  instanceId?: string;
}
