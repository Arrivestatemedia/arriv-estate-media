import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { waitUntil } from 'base44:runtime';
import { normalizeSource, sha256 } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      job_id, event_type,
      source, utm_source, utm_medium, utm_campaign, utm_content,
      referrer_url, landing_page_url, session_id, tenant_id,
    } = body;

    if (!event_type) return Response.json({ error: 'event_type is required' }, { status: 400 });

    const validTypes = ["page_view", "apply_click", "application_started", "application_completed", "careers_hub_view"];
    if (!validTypes.includes(event_type)) {
      return Response.json({ error: 'Invalid event_type' }, { status: 400 });
    }

    let resolvedTenantId = tenant_id || "tnt_estate_media";

    // Resolve tenant_id from job_id if not provided
    if (job_id && !tenant_id) {
      try {
        const jobRes = await base44.asServiceRole.entities.JobOpening.filter({ job_id });
        const jobList = jobRes?.data ?? jobRes ?? [];
        const job = Array.isArray(jobList) ? jobList[0] : null;
        if (job) resolvedTenantId = job.tenant_id || resolvedTenantId;
      } catch {}
    }

    const normalizedSource = normalizeSource(source || utm_source);
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || '';
    const ipHash = rawIp ? await sha256(`khetha-salt-${rawIp}`) : '';

    waitUntil(base44.asServiceRole.entities.JobPageEvent.create({
      tenant_id: resolvedTenantId,
      job_id: job_id || "",
      event_type,
      source: normalizedSource,
      utm_source: utm_source || "",
      utm_medium: utm_medium || "",
      utm_campaign: utm_campaign || "",
      utm_content: utm_content || "",
      referrer_url: (referrer_url || "").substring(0, 500),
      landing_page_url: (landing_page_url || "").substring(0, 500),
      visitor_ip_hash: ipHash,
      visitor_session_id: session_id || "",
    }).catch(() => {}));

    return Response.json({ success: true });
  } catch (error) {
    console.error('trackJobPageEvent error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}