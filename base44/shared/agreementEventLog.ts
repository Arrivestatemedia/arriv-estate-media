// ============================================================================
// AGREEMENT EVENT LOG
//
// Append-only event stream for agreement lifecycle events.
// Events are never rewritten or deleted.
// ============================================================================

import { generateEventId } from './agreementSecurity.ts';

export async function logAgreementEvent(
  client: any,
  agreementId: string,
  eventType: string,
  metadata: {
    recipient_id?: string;
    actor?: string;
    actor_type?: 'admin' | 'sales_rep' | 'recipient' | 'system';
    metadata_json?: Record<string, any>;
  } = {}
): Promise<void> {
  await client.entities.AgreementEvent.create({
    agreement_id: agreementId,
    event_id: generateEventId(),
    event_type: eventType,
    recipient_id: metadata.recipient_id || '',
    actor: metadata.actor || 'system',
    actor_type: metadata.actor_type || 'system',
    metadata_json: metadata.metadata_json ? JSON.stringify(metadata.metadata_json) : '',
    timestamp: new Date().toISOString(),
    immutable: true,
  });
}

export async function logAgreementAudit(
  client: any,
  agreementId: string,
  action: string,
  metadata: {
    actor?: string;
    actor_type?: 'admin' | 'sales_rep' | 'recipient' | 'system' | 'provider';
    actor_user_id?: string;
    entity_type?: string;
    entity_id?: string;
    recipient_id?: string;
    before_snapshot?: string;
    after_snapshot?: string;
    reason?: string;
    request_id?: string;
    session_id?: string;
    ip_address?: string;
    user_agent?: string;
  } = {}
): Promise<void> {
  await client.entities.AgreementAuditTrail.create({
    agreement_id: agreementId,
    audit_id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    actor: metadata.actor || 'system',
    actor_type: metadata.actor_type || 'system',
    actor_user_id: metadata.actor_user_id || '',
    action,
    entity_type: metadata.entity_type || '',
    entity_id: metadata.entity_id || '',
    recipient_id: metadata.recipient_id || '',
    before_snapshot: metadata.before_snapshot || '',
    after_snapshot: metadata.after_snapshot || '',
    reason: metadata.reason || '',
    request_id: metadata.request_id || '',
    session_id: metadata.session_id || '',
    ip_address: metadata.ip_address || '',
    user_agent: metadata.user_agent || '',
    timestamp: new Date().toISOString(),
  });
}