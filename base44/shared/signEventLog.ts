// Shared helper for logging immutable signing lifecycle events to the SignEvent
// entity. Used by sendSignRequest, submitSignature, getSignRequest, and
// manageSignDocuments to maintain an append-only audit trail — the "event
// stream" capability merged from Arriv Agreements into the Documents & Sign
// system.
//
// Events are write-once: once created they are never updated or deleted.
// The SignEvent entity has admin-only RLS so only admins can read the full
// audit trail. Sales reps see events for their own sent documents via the
// getAdminAgreementCenter function which filters by sent_by_email.

export interface SignEventParams {
  request_id: string;
  sign_group_id?: string;
  document_id?: string;
  document_title?: string;
  document_category?: string;
  event_type: string;
  actor_email?: string;
  actor_name?: string;
  actor_type?: string;
  recipient_email?: string;
  recipient_name?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  tenant_id?: string;
}

export async function logSignEvent(
  base44: any,
  params: SignEventParams
): Promise<string> {
  const event_id = `sev_${crypto.randomUUID().slice(0, 12)}`;
  await base44.asServiceRole.entities.SignEvent.create({
    tenant_id: params.tenant_id || "tnt_estate_media",
    event_id,
    request_id: params.request_id,
    sign_group_id: params.sign_group_id || "",
    document_id: params.document_id || "",
    document_title: params.document_title || "",
    document_category: params.document_category || "regular_document",
    event_type: params.event_type,
    actor_email: params.actor_email || "",
    actor_name: params.actor_name || "",
    actor_type: params.actor_type || "system",
    recipient_email: params.recipient_email || "",
    recipient_name: params.recipient_name || "",
    metadata_json: params.metadata ? JSON.stringify(params.metadata) : "",
    ip_address: params.ip_address || "",
    user_agent: params.user_agent || "",
    timestamp: new Date().toISOString(),
  });
  return event_id;
}

// Fetch the event stream for a given sign request (or sign group).
// Returns events sorted oldest-first for chronological display.
export async function getSignEvents(
  base44: any,
  request_id?: string,
  sign_group_id?: string
): Promise<any[]> {
  const filter: any = {};
  if (sign_group_id) filter.sign_group_id = sign_group_id;
  else if (request_id) filter.request_id = request_id;
  else return [];

  const events = await base44.asServiceRole.entities.SignEvent.filter(
    filter,
    "timestamp",
    200
  );
  return Array.isArray(events) ? events : (events?.data || []);
}

// Check whether all signers in a sign_group have signed, and if so, return
// the list of signed requests so the caller can generate a completion
// certificate.
export async function checkSignGroupCompletion(
  base44: any,
  sign_group_id: string
): Promise<{ allSigned: boolean; requests: any[] }> {
  if (!sign_group_id) return { allSigned: false, requests: [] };
  const groupReqs = await base44.asServiceRole.entities.SignRequest.filter(
    { sign_group_id },
    "-sent_at",
    50
  );
  const requests = (Array.isArray(groupReqs) ? groupReqs : (groupReqs?.data || [])) || [];
  if (requests.length === 0) return { allSigned: false, requests: [] };
  const allSigned = requests.every((r) => r.status === "signed");
  return { allSigned, requests };
}