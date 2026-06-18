/** Override values for service identity metadata. All fields optional. */
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
