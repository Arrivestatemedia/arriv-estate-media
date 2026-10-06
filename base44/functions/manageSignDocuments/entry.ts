import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSignAdmin, detectMergeFields, parseSignatureFields, getAppBaseUrl, buildSignRequestEmailHtml } from '../../shared/signEngine.ts';
import { sendBusinessEmailOrQueue } from '../../shared/businessEmailQueue.ts';
import { logSignEvent } from '../../shared/signEventLog.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const admin = await resolveSignAdmin(base44, body);
    if (!admin.ok) return Response.json({ error: 'Admin access required' }, { status: 403 });

    // LIST templates
    if (action === 'list') {
      const filter = admin.tenantId ? { tenant_id: admin.tenantId } : {};
      const docs = await base44.asServiceRole.entities.SignDocument.filter(filter, '-updated_date', 200);
      const arr = Array.isArray(docs) ? docs : (docs?.data || []);
      return Response.json({ documents: arr });
    }

    // GET single
    if (action === 'get') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const doc = await base44.asServiceRole.entities.SignDocument.get(id);
      if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
      return Response.json({ document: doc });
    }

    // CREATE
    if (action === 'create') {
      const tenantId = admin.tenantId || body?.tenant_id || "tnt_estate_media";
      const { title, document_type, source_type, body_ref, body_html, document_id, document_category } = body;
      if (!title) return Response.json({ error: 'title is required' }, { status: 400 });
      if (!source_type) return Response.json({ error: 'source_type is required' }, { status: 400 });
      if (source_type === 'upload' && !body_ref) return Response.json({ error: 'body_ref (uploaded file) is required for upload source' }, { status: 400 });
      if (source_type === 'editor' && !body_html) return Response.json({ error: 'body_html is required for editor source' }, { status: 400 });

      const docId = document_id || `doc_${crypto.randomUUID().slice(0, 12)}`;
      const now = new Date().toISOString();
      const mergeFields = source_type === 'editor' ? detectMergeFields(body_html) : [];
      const sigFields = source_type === 'editor' ? parseSignatureFields(body_html) : (body.signature_fields || []);

      const created = await base44.asServiceRole.entities.SignDocument.create({
        tenant_id: tenantId,
        document_id: docId,
        title,
        document_type: document_type || 'custom',
        document_category: document_category || 'regular_document',
        source_type,
        body_ref: source_type === 'upload' ? body_ref : '',
        body_html: source_type === 'editor' ? body_html : '',
        merge_fields: mergeFields,
        signature_fields: sigFields,
        version: '1.0',
        active: true,
        change_summary: '',
        created_by_name: admin.actorName,
        created_at: now,
        updated_at: now,
      });
      return Response.json({ success: true, document: created });
    }

    // UPDATE
    if (action === 'update') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.SignDocument.get(id);
      if (!existing) return Response.json({ error: 'Document not found' }, { status: 404 });

      const update = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) update.title = body.title;
      if (body.document_type !== undefined) update.document_type = body.document_type;
      if (body.document_category !== undefined) update.document_category = body.document_category;
      if (body.active !== undefined) update.active = body.active;
      if (body.change_summary !== undefined) update.change_summary = body.change_summary;
      if (body.version !== undefined) update.version = String(body.version);

      if (body.source_type === 'editor' && body.body_html !== undefined) {
        update.source_type = 'editor';
        update.body_html = body.body_html;
        update.body_ref = '';
        update.merge_fields = detectMergeFields(body.body_html);
        update.signature_fields = parseSignatureFields(body.body_html);
      }
      if (body.source_type === 'upload' && body.body_ref !== undefined) {
        update.source_type = 'upload';
        update.body_ref = body.body_ref;
        update.body_html = '';
        update.merge_fields = [];
      }
      if (body.signature_fields !== undefined) {
        update.signature_fields = body.signature_fields;
      }

      const updated = await base44.asServiceRole.entities.SignDocument.update(id, update);
      return Response.json({ success: true, document: updated });
    }

    // DELETE
    if (action === 'delete') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      await base44.asServiceRole.entities.SignDocument.delete(id);
      return Response.json({ success: true });
    }

    // LIST SIGN REQUESTS (sent instances)
    if (action === 'list_requests') {
      const filter = admin.tenantId ? { tenant_id: admin.tenantId } : {};
      const reqs = await base44.asServiceRole.entities.SignRequest.filter(filter, '-sent_at', 200);
      const arr = Array.isArray(reqs) ? reqs : (reqs?.data || []);
      return Response.json({ requests: arr });
    }

    // VOID a sign request
    if (action === 'void_request') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.SignRequest.get(id);
      if (!existing) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (existing.status === 'signed') return Response.json({ error: 'Cannot void a signed document' }, { status: 400 });
      await base44.asServiceRole.entities.SignRequest.update(id, {
        status: 'voided',
        voided_at: new Date().toISOString(),
      });
      await logSignEvent(base44, {
        request_id: existing.request_id,
        sign_group_id: existing.sign_group_id,
        document_id: existing.document_id,
        document_title: existing.document_title,
        document_category: existing.document_category,
        event_type: 'VOIDED',
        actor_email: admin.actorEmail,
        actor_name: admin.actorName,
        actor_type: admin.isSalesRep ? 'sales_rep' : 'admin',
        recipient_email: existing.candidate_email,
        recipient_name: existing.candidate_name,
      });
      return Response.json({ success: true });
    }

    // SEND REMINDER for a sign request
    if (action === 'send_reminder') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.SignRequest.get(id);
      if (!existing) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (['signed', 'voided', 'declined', 'expired'].includes(existing.status)) {
        return Response.json({ error: 'Cannot remind on a terminal request' }, { status: 400 });
      }
      const baseUrl = getAppBaseUrl();
      const signUrl = `${baseUrl}/sign/${existing.sign_token}`;
      const firstName = (existing.candidate_name || '').split(' ')[0] || 'there';
      const html = buildSignRequestEmailHtml(firstName, existing.document_title, signUrl, false);
      await sendBusinessEmailOrQueue(base44, {
        to: existing.candidate_email,
        subject: `Reminder: ${existing.document_title} — Action Required`,
        htmlContent: html,
      });
      await logSignEvent(base44, {
        request_id: existing.request_id,
        sign_group_id: existing.sign_group_id,
        document_id: existing.document_id,
        document_title: existing.document_title,
        document_category: existing.document_category,
        event_type: 'REMINDER_SENT',
        actor_email: admin.actorEmail,
        actor_name: admin.actorName,
        actor_type: admin.isSalesRep ? 'sales_rep' : 'admin',
        recipient_email: existing.candidate_email,
        recipient_name: existing.candidate_name,
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}