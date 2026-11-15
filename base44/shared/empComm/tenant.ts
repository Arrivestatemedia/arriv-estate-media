/**
 * Tenant resolution for the employee communications layer.
 *
 * Arriv One is built to host several independent companies. Every record this
 * layer writes is tagged with a tenant, and every read is scoped by the tenant
 * that the employee's own account belongs to — never by a value the caller sent.
 */

export const DEFAULT_TENANT = 'tnt_estate_media';

export function tenantFor(member: any) {
  return String(member?.tenant_id || DEFAULT_TENANT);
}