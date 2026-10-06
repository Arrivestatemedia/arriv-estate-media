import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSignAdmin, detectMergeFields, parseSignatureFields } from '../../shared/signEngine.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const admin = await resolveSignAdmin(base44, body);
    if (!admin.ok) return Response.json({ error: 'Admin access required' }, { status: 403 });

    // LIST templates
    if (action === 'list') {
      const filter = admin.tenantId ? { tenant_id: admin.tenantId, category: 'hr' } : { category: 'hr' };
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
      const { title, document_type, source_type, body_ref, body_html, document_id } = body;
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
      const filter = admin.tenantId ? { tenant_id: admin.tenantId, organization_id: '' } : { organization_id: '' };
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
      return Response.json({ success: true });
    }

    // ─── B2B / Arriv Agreements merged actions ───────────────────────────
    // These actions surface SignDocument/SignRequest data in the format the
    // Arriv Agreements center expects, so both pages use ONE signing backend.

    // LIST B2B — agreements + templates for the Arriv Agreements center
    if (action === 'list_b2b') {
      const orgId = body?.organization_id;
      const docFilter = orgId ? { organization_id: orgId, category: 'b2b' } : { category: 'b2b' };
      const reqFilter = orgId ? { organization_id: orgId } : {};

      const [docs, reqs] = await Promise.all([
        base44.asServiceRole.entities.SignDocument.filter(docFilter, '-updated_date', 200),
        base44.asServiceRole.entities.SignRequest.filter(reqFilter, '-sent_at', 200),
      ]);
      const docArr = Array.isArray(docs) ? docs : (docs?.data || []);
      const reqArr = Array.isArray(reqs) ? reqs : (reqs?.data || []);
      const b2bReqs = reqArr.filter(r => r.organization_id || r.agreement_type);

      // Group by sign_group_id (or individual request id)
      const groupMap = {};
      for (const r of b2bReqs) {
        const gid = r.sign_group_id || r.id;
        if (!groupMap[gid]) groupMap[gid] = [];
        groupMap[gid].push(r);
      }

      const agreements = Object.entries(groupMap).map(([gid, group]) => {
        const first = group[0];
        const total = group.length;
        const signedCount = group.filter(r => r.status === 'signed').length;
        const allSigned = signedCount === total;
        const anyDeclined = group.some(r => r.status === 'declined');
        const anyVoided = group.some(r => r.status === 'voided');

        let status = 'SENT';
        if (allSigned) status = 'COMPLETED';
        else if (anyDeclined) status = 'DECLINED';
        else if (anyVoided) status = 'VOIDED';
        else if (signedCount > 0) status = 'PARTIALLY_SIGNED';
        else if (group.some(r => r.status === 'viewed')) status = 'OPENED';

        return {
          id: gid,
          document_id: first.document_id,
          name: first.document_title,
          status,
          organization_id: first.organization_id || '',
          organization_name: first.organization_id || '',
          sales_rep_email: first.sales_rep_email || first.sent_by_email || '',
          required_count: total,
          completed_count: signedCount,
          recipient_summary: group.map(r => ({
            recipient_id: r.id,
            name: r.signer_name || r.candidate_name,
            email: r.signer_email || r.candidate_email,
            status: r.status.toUpperCase(),
            is_viewing_now: false,
          })),
        };
      });

      const templates = docArr.map(d => ({
        id: d.id,
        document_id: d.document_id,
        name: d.title,
        category: d.agreement_type || 'B2B_SERVICE_AGREEMENT',
        current_version_number: d.version || '1.0',
        document_type: d.document_type,
        source_type: d.source_type,
        active: d.active,
      }));

      // Unsent B2B documents = drafts
      const sentDocIds = new Set(b2bReqs.map(r => r.document_id));
      const drafts = docArr
        .filter(d => !sentDocIds.has(d.document_id))
        .map(d => ({
          id: d.id,
          document_id: d.document_id,
          name: d.title,
          status: 'DRAFT',
          organization_id: d.organization_id || '',
          organization_name: d.organization_id || '',
          sales_rep_email: d.sales_rep_email || '',
          required_count: 0,
          completed_count: 0,
          recipient_summary: [],
        }));

      return Response.json({ agreements, drafts, templates });
    }

    // GET DETAIL — single request with recipients + event timeline
    if (action === 'get_detail') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const req = await base44.asServiceRole.entities.SignRequest.get(id);
      if (!req) return Response.json({ error: 'Request not found' }, { status: 404 });

      // Gather all requests in the same sign group (or just this one)
      let group = [req];
      if (req.sign_group_id) {
        const groupReqs = await base44.asServiceRole.entities.SignRequest.filter({ sign_group_id: req.sign_group_id });
        group = Array.isArray(groupReqs) ? groupReqs : (groupReqs?.data || [req]);
      }

      const total = group.length;
      const signedCount = group.filter(r => r.status === 'signed').length;
      const allSigned = signedCount === total;

      let status = 'SENT';
      if (allSigned) status = 'COMPLETED';
      else if (group.some(r => r.status === 'declined')) status = 'DECLINED';
      else if (group.some(r => r.status === 'voided')) status = 'VOIDED';
      else if (signedCount > 0) status = 'PARTIALLY_SIGNED';
      else if (group.some(r => r.status === 'viewed')) status = 'OPENED';

      const recipients = group.map(r => ({
        recipient_id: r.id,
        name: r.signer_name || r.candidate_name,
        email: r.signer_email || r.candidate_email,
        role: r.signing_order > 1 ? `Signer ${r.signing_order}` : 'Signer',
        status: r.status.toUpperCase(),
        is_viewing_now: false,
      }));

      // Build event timeline from timestamps
      const events = [];
      for (const r of group) {
        if (r.sent_at) events.push({ event_type: 'SENT', timestamp: r.sent_at, actor: r.signer_name || r.candidate_name });
        if (r.viewed_at) events.push({ event_type: 'VIEWED', timestamp: r.viewed_at, actor: r.signer_name || r.candidate_name });
        if (r.signed_at) events.push({ event_type: 'SIGNED', timestamp: r.signed_at, actor: r.signer_name || r.candidate_name });
        if (r.declined_at) events.push({ event_type: 'DECLINED', timestamp: r.declined_at, actor: r.signer_name || r.candidate_name });
        if (r.voided_at) events.push({ event_type: 'VOIDED', timestamp: r.voided_at, actor: 'admin' });
      }
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return Response.json({
        agreement: {
          id: req.sign_group_id || req.id,
          name: req.document_title,
          status,
          organization_id: req.organization_id || '',
          sales_rep_email: req.sales_rep_email || req.sent_by_email || '',
          required_count: total,
          completed_count: signedCount,
          completion_certificate_uri: req.completion_certificate_uri || '',
        },
        recipients,
        events,
      });
    }

    // DUPLICATE — duplicate a document template (universal, works for HR + B2B)
    if (action === 'duplicate') {
      const sourceId = body?.source_id;
      if (!sourceId) return Response.json({ error: 'source_id is required' }, { status: 400 });
      const source = await base44.asServiceRole.entities.SignDocument.get(sourceId);
      if (!source) return Response.json({ error: 'Source document not found' }, { status: 404 });

      const newDocId = `doc_${crypto.randomUUID().slice(0, 12)}`;
      const now = new Date().toISOString();
      const duplicated = await base44.asServiceRole.entities.SignDocument.create({
        tenant_id: source.tenant_id,
        document_id: newDocId,
        title: `${source.title} (Copy)`,
        document_type: source.document_type,
        source_type: source.source_type,
        body_ref: source.body_ref || '',
        body_html: source.body_html || '',
        merge_fields: source.merge_fields || [],
        signature_fields: source.signature_fields || [],
        version: '1.0',
        active: true,
        change_summary: `Duplicated from ${source.title}`,
        created_by_name: admin.actorName,
        created_at: now,
        updated_at: now,
        organization_id: source.organization_id || '',
        agreement_type: source.agreement_type || '',
        sales_rep_email: source.sales_rep_email || body?.sales_rep_email || '',
        category: source.category || 'hr',
      });
      return Response.json({ success: true, document: duplicated });
    }

    // CREATE FROM B2B QUOTE — generate a SignDocument from a B2B quote/contract
    if (action === 'create_from_b2b_quote') {
      const { quote_id, contract_id, organization_id, sales_rep_email, title } = body;
      const tenantId = admin.tenantId || body?.tenant_id || "tnt_estate_media";

      // Fetch quote or contract data for the document body
      let quoteData = null;
      let contractData = null;
      if (quote_id) {
        const quotes = await base44.asServiceRole.entities.B2BQuote.filter({ quote_id });
        quoteData = Array.isArray(quotes) && quotes[0] ? quotes[0] : null;
      }
      if (contract_id) {
        const contracts = await base44.asServiceRole.entities.B2BContract.filter({ contract_id });
        contractData = Array.isArray(contracts) && contracts[0] ? contracts[0] : null;
      }

      // Build a simple HTML body from the quote/contract terms
      const orgName = body?.organization_name || 'the Organization';
      const planId = contractData?.plan_id || quoteData?.plan_id || '';
      const monthlyPrice = contractData?.monthly_price || quoteData?.monthly_price || 0;
      const termMonths = contractData?.term_months || 12;

      const bodyHtml = `<h1>B2B Service Agreement</h1>
<p>This B2B Service Agreement ("Agreement") is entered into between Arriv Estate Media ("Company") and ${orgName} ("Client"), effective as of {{effective_date}}.</p>
<h2>Services</h2>
<p>The Company shall provide media production services as described in the selected plan: <strong>${planId}</strong>.</p>
<h2>Term</h2>
<p>This Agreement shall be for a term of ${termMonths} months, commencing on the effective date.</p>
<h2>Compensation</h2>
<p>The Client agrees to pay the Company a monthly fee of $${monthlyPrice} for the services described herein.</p>
<h2>Signatures</h2>
<p>By signing below, the parties agree to the terms of this Agreement.</p>
<p>Company Signature: [[signature:company_signer]]</p>
<p>Client Signature: [[signature:client_signer]]</p>
<p>Date: [[date:agreement_date]]</p>`;

      const docId = `doc_${crypto.randomUUID().slice(0, 12)}`;
      const now = new Date().toISOString();
      const mergeFields = ['effective_date', 'agreement_date'];
      const sigFields = [
        { field_id: 'company_signer', type: 'signature', label: 'Company Signature', required: true, assigned_signer: '' },
        { field_id: 'client_signer', type: 'signature', label: 'Client Signature', required: true, assigned_signer: '' },
        { field_id: 'agreement_date', type: 'date', label: 'Date', required: true, assigned_signer: '' },
      ];

      const created = await base44.asServiceRole.entities.SignDocument.create({
        tenant_id: tenantId,
        document_id: docId,
        title: title || `B2B Service Agreement — ${orgName}`,
        document_type: 'custom',
        source_type: 'editor',
        body_ref: '',
        body_html: bodyHtml,
        merge_fields: mergeFields,
        signature_fields: sigFields,
        version: '1.0',
        active: true,
        change_summary: `Generated from B2B ${quote_id ? 'quote' : 'contract'}`,
        created_by_name: admin.actorName,
        created_at: now,
        updated_at: now,
        organization_id: organization_id || '',
        agreement_type: 'B2B_SERVICE_AGREEMENT',
        sales_rep_email: sales_rep_email || '',
        category: 'b2b',
      });
      return Response.json({ success: true, document: created });
    }

    // SEND REMINDER — nudge a pending signer
    if (action === 'send_reminder') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const req = await base44.asServiceRole.entities.SignRequest.get(id);
      if (!req) return Response.json({ error: 'Request not found' }, { status: 404 });
      if (!['sent', 'viewed'].includes(req.status)) {
        return Response.json({ error: 'Can only remind pending requests' }, { status: 400 });
      }
      const signerEmail = req.signer_email || req.candidate_email;
      if (signerEmail) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: signerEmail,
          subject: `Reminder: ${req.document_title} awaits your signature`,
          body: `<p>Hello ${req.signer_name || req.candidate_name},</p><p>This is a friendly reminder that <strong>${req.document_title}</strong> is awaiting your signature.</p><p>Please use your original signing link to complete the document.</p>`,
        });
      }
      return Response.json({ success: true });
    }

    // GENERATE COMPLETION CERTIFICATE — after all signers complete
    if (action === 'generate_completion_certificate') {
      const id = body?.id;
      if (!id) return Response.json({ error: 'id is required' }, { status: 400 });
      const req = await base44.asServiceRole.entities.SignRequest.get(id);
      if (!req) return Response.json({ error: 'Request not found' }, { status: 404 });

      let group = [req];
      if (req.sign_group_id) {
        const groupReqs = await base44.asServiceRole.entities.SignRequest.filter({ sign_group_id: req.sign_group_id });
        group = Array.isArray(groupReqs) ? groupReqs : (groupReqs?.data || [req]);
      }

      const allSigned = group.every(r => r.status === 'signed');
      if (!allSigned) return Response.json({ error: 'Not all signers have completed' }, { status: 400 });

      const certHtml = `<html><body style="font-family: Arial, sans-serif; padding: 60px;">
<div style="text-align: center; border: 3px solid #B8956A; border-radius: 12px; padding: 40px;">
<h1 style="color: #1A1A1A; font-size: 28px;">Certificate of Completion</h1>
<p style="color: #B8956A; font-size: 16px; letter-spacing: 2px;">ARRIV ESTATE MEDIA</p>
<hr style="border-color: #B8956A; margin: 20px 0;" />
<p style="font-size: 14px; color: #555;">This certifies that the following document has been fully executed by all parties:</p>
<h2 style="color: #1A1A1A; font-size: 22px;">${req.document_title}</h2>
<p style="font-size: 14px; color: #555;">Completed on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
<div style="margin-top: 30px; text-align: left;">
<h3 style="color: #1A1A1A; font-size: 16px;">Signatures</h3>
${group.map(r => `<p style="font-size: 14px;"><strong>${r.signer_name || r.candidate_name}</strong> — Signed on ${new Date(r.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`).join('')}
</div>
</div>
</body></html>`;

      const certFile = new File([certHtml], `completion_certificate_${req.sign_group_id || req.id}.html`, { type: 'text/html' });
      const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: certFile });
      const certUri = uploadRes?.file_uri || '';

      // Update all requests in the group with the certificate URI
      for (const r of group) {
        await base44.asServiceRole.entities.SignRequest.update(r.id, { completion_certificate_uri: certUri });
      }

      return Response.json({ success: true, completion_certificate_uri: certUri });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}