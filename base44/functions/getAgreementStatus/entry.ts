import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Re-pointed to read from the unified Sign system (SignRequest/SignEvent)
// instead of the deprecated Agreement entities. The `agreement_id` parameter
// is now a SignRequest.request_id.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { agreement_id } = body;

    // Get the SignRequest by request_id
    const reqs = await base44.asServiceRole.entities.SignRequest.filter({ request_id: agreement_id });
    const requests = (Array.isArray(reqs) ? reqs : (reqs?.data || [])) || [];
    if (requests.length === 0) return Response.json({ status: 'ERROR', error: 'Not found' }, { status: 404 });
    const signRequest = requests[0];

    // Get all signers in the group (for multi-signer)
    let groupReqs: any[] = [signRequest];
    if (signRequest.sign_group_id) {
      const groupResults = await base44.asServiceRole.entities.SignRequest.filter(
        { sign_group_id: signRequest.sign_group_id }, '-sent_at', 50
      );
      groupReqs = (Array.isArray(groupResults) ? groupResults : (groupResults?.data || [])) || [signRequest];
    }

    // Get events from the immutable event stream
    const eventFilter: any = signRequest.sign_group_id
      ? { sign_group_id: signRequest.sign_group_id }
      : { request_id: agreement_id };
    const events = await base44.asServiceRole.entities.SignEvent.filter(eventFilter, 'timestamp', 200);
    const eventArr = (Array.isArray(events) ? events : (events?.data || [])) || [];

    const statusMap: Record<string, string> = {
      sent: 'SENT', viewed: 'OPENED', signed: 'COMPLETED',
      declined: 'DECLINED', voided: 'VOIDED', expired: 'EXPIRED',
    };

    return Response.json({
      status: 'OK',
      data: {
        agreement: {
          id: signRequest.id,
          agreement_id: signRequest.request_id,
          name: signRequest.document_title || 'Untitled',
          agreement_type: signRequest.document_type || 'custom',
          status: statusMap[signRequest.status] || (signRequest.status || '').toUpperCase() || 'SENT',
          document_type: signRequest.source_type === 'editor' ? 'native' : 'uploaded',
          created_at: signRequest.sent_at || signRequest.created_date,
          sent_at: signRequest.sent_at,
          completed_at: signRequest.signed_at,
          expires_at: signRequest.expires_at,
          completion_certificate_uri: signRequest.completion_certificate_uri || '',
        },
        recipients: groupReqs.map((r: any) => ({
          recipient_id: r.request_id,
          name: r.signer_name || r.candidate_name || '',
          email: r.signer_email || r.candidate_email || '',
          role: 'SIGNER',
          status: statusMap[r.status] || (r.status || '').toUpperCase() || 'PENDING',
          is_required: true,
          consent_status: 'accepted',
          notified_at: r.sent_at,
          opened_at: r.viewed_at,
          completed_at: r.signed_at,
          declined_at: r.declined_at,
          is_viewing_now: r.status === 'viewed',
        })),
        fields: (signRequest.signature_fields || []).map((f: any) => ({
          field_id: f.field_id,
          recipient_id: f.assigned_signer || '',
          field_type: (f.type || 'signature').toUpperCase(),
          label: f.label || '',
          required: f.required !== false,
        })),
        events: eventArr.map((e: any) => ({
          event_type: e.event_type,
          timestamp: e.timestamp,
          recipient_id: e.recipient_email || '',
          actor: e.actor_email || e.actor_name || '',
        })),
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});