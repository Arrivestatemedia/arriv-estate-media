import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { generateTemplateId, sha256 } from '../../shared/agreementSecurity.ts';
import { logAgreementAudit } from '../../shared/agreementEventLog.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── LIST TEMPLATES ──────────────────────────────────────────────
    if (action === 'list') {
      const { category, status, product_scope } = body;
      const filter: any = {};
      if (category) filter.category = category;
      if (status) filter.status = status;
      if (product_scope) filter.product_scope = product_scope;
      const templates = await base44.asServiceRole.entities.AgreementTemplate.filter(filter, '-updated_at', 100);
      return Response.json({ status: 'OK', data: templates });
    }

    // ── GET TEMPLATE (with current version) ────────────────────────
    if (action === 'get') {
      const { template_id } = body;
      const template = await base44.asServiceRole.entities.AgreementTemplate.get(template_id);
      if (!template) return Response.json({ status: 'ERROR', error: 'Template not found' }, { status: 404 });

      let currentVersion = null;
      if (template.current_version_id) {
        currentVersion = await base44.asServiceRole.entities.AgreementTemplateVersion.get(template.current_version_id).catch(() => null);
      }
      return Response.json({ status: 'OK', data: { template, current_version: currentVersion } });
    }

    // ── CREATE TEMPLATE ─────────────────────────────────────────────
    if (action === 'create') {
      const { name, category, description, document_type, document_body, document_file_uri, document_file_name, merge_fields, default_recipients, default_fields, routing_type, notification_rules, product_scope, actor } = body;

      const templateId = generateTemplateId();
      const now = new Date().toISOString();

      // Compute source hash
      const sourceContent = document_type === 'native' ? (document_body || '') : (document_file_uri || '');
      const documentHash = await sha256(sourceContent);

      const template = await base44.asServiceRole.entities.AgreementTemplate.create({
        template_id: templateId,
        name,
        category: category || 'OTHER',
        description: description || '',
        status: 'draft',
        current_version_number: 0,
        document_type: document_type || 'native',
        document_body: document_body || '',
        document_file_uri: document_file_uri || '',
        document_file_name: document_file_name || '',
        document_hash: documentHash,
        merge_fields: merge_fields || [],
        default_recipients: default_recipients || [],
        default_fields: default_fields || [],
        routing_type: routing_type || 'parallel',
        notification_rules: notification_rules || { send_on_create: false, reminder_schedule_hours: [24, 72, 168] },
        product_scope: product_scope || 'estate_media',
        created_by: actor || 'system',
        created_at: now,
        updated_at: now,
      });

      return Response.json({ status: 'OK', data: { template_id: templateId } });
    }

    // ── UPDATE TEMPLATE (creates a new version) ────────────────────
    if (action === 'update') {
      const { template_id, name, description, document_body, document_file_uri, document_file_name, merge_fields, default_recipients, default_fields, routing_type, notification_rules, change_reason, actor } = body;

      const template = await base44.asServiceRole.entities.AgreementTemplate.get(template_id);
      if (!template) return Response.json({ status: 'ERROR', error: 'Template not found' }, { status: 404 });

      const newVersionNumber = (template.current_version_number || 0) + 1;
      const now = new Date().toISOString();

      // Compute new hash
      const sourceContent = template.document_type === 'native' ? (document_body || template.document_body) : (document_file_uri || template.document_file_uri);
      const newHash = await sha256(sourceContent);

      // Create new immutable version snapshot
      const versionData = JSON.stringify({
        name: name || template.name,
        category: template.category,
        description: description || template.description,
        document_type: template.document_type,
        document_body: document_body || template.document_body,
        document_file_uri: document_file_uri || template.document_file_uri,
        document_file_name: document_file_name || template.document_file_name,
        merge_fields: merge_fields || template.merge_fields,
        default_recipients: default_recipients || template.default_recipients,
        default_fields: default_fields || template.default_fields,
        routing_type: routing_type || template.routing_type,
        notification_rules: notification_rules || template.notification_rules,
      });

      const version = await base44.asServiceRole.entities.AgreementTemplateVersion.create({
        template_id,
        version_number: newVersionNumber,
        version_data_json: versionData,
        document_hash: newHash,
        status: 'active',
        immutable_snapshot: true,
        change_reason: change_reason || 'Template edited',
        created_by: actor || 'system',
        created_at: now,
      });

      // Supersede previous version
      if (template.current_version_id) {
        await base44.asServiceRole.entities.AgreementTemplateVersion.update(template.current_version_id, { status: 'superseded' });
      }

      // Update template to point to new version
      await base44.asServiceRole.entities.AgreementTemplate.update(template_id, {
        name: name || template.name,
        description: description || template.description,
        document_body: document_body || template.document_body,
        document_file_uri: document_file_uri || template.document_file_uri,
        document_file_name: document_file_name || template.document_file_name,
        document_hash: newHash,
        merge_fields: merge_fields || template.merge_fields,
        default_recipients: default_recipients || template.default_recipients,
        default_fields: default_fields || template.default_fields,
        routing_type: routing_type || template.routing_type,
        notification_rules: notification_rules || template.notification_rules,
        current_version_id: version.id,
        current_version_number: newVersionNumber,
        updated_at: now,
      });

      return Response.json({ status: 'OK', data: { template_id, version_number: newVersionNumber, version_id: version.id } });
    }

    // ── ACTIVATE/ARCHIVE TEMPLATE ──────────────────────────────────
    if (action === 'set_status') {
      const { template_id, status, actor } = body;
      await base44.asServiceRole.entities.AgreementTemplate.update(template_id, { status, updated_at: new Date().toISOString() });
      return Response.json({ status: 'OK' });
    }

    // ── GET VERSION HISTORY ─────────────────────────────────────────
    if (action === 'version_history') {
      const { template_id } = body;
      const versions = await base44.asServiceRole.entities.AgreementTemplateVersion.filter({ template_id }, '-version_number', 50);
      return Response.json({ status: 'OK', data: versions });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});