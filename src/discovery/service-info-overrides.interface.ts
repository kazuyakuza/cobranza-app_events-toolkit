/**
 * Override values for service identity metadata.
 *
 * All fields are optional. When provided, they take precedence
 * over the defaults resolved from package.json.
 *
 * @see ServiceInfo for the fully resolved service identity.
 */
export interface ServiceInfoOverrides {
  /** Override service name (defaults to package.json "name"). */
  name?: string;
  /** Override service version (defaults to package.json "version"). */
  version?: string;
  /** Override service description (defaults to package.json "description"). */
  description?: string;
  /** Override instance identifier (auto-generated if omitted). */
  instanceId?: string;
}
