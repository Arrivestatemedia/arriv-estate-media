import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { waitUntil, secrets } from 'base44:runtime';
import { normalizeSource, sha256, DEFAULT_BRANDING } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      slug, job_id, source_url, host,
      source, utm_source, utm_medium, utm_campaign, utm_content,
      referrer_url, landing_page_url, session_id,
    } = body;

    const tenantId = "tnt_estate_media";

    // Find the job
    let job = null;
    if (slug) {
      const res = await base44.asServiceRole.entities.JobOpening.filter({ tenant_id: tenantId, public_slug: slug });
      const list = res?.data ?? res ?? [];
      job = Array.isArray(list) ? list[0] : null;
    }
    if (!job && job_id) {
      const res = await base44.asServiceRole.entities.JobOpening.filter({ tenant_id: tenantId, job_id: job_id });
      const list = res?.data ?? res ?? [];
      job = Array.isArray(list) ? list[0] : null;
    }
    if (!job && source_url) {
      const res = await base44.asServiceRole.entities.JobOpening.filter({ tenant_id: tenantId, source_url });
      const list = res?.data ?? res ?? [];
      job = Array.isArray(list) ? list[0] : null;
    }

    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (job.status === "closed" || job.status === "filled" || job.archived || job.public_visibility === false) {
      return Response.json({ error: 'This position is no longer available' }, { status: 404 });
    }

    // Record page_view event (fire-and-forget)
    const normalizedSource = normalizeSource(source || utm_source);
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || '';
    const ipHash = rawIp ? await sha256(`khetha-salt-${rawIp}`) : '';

    waitUntil(base44.asServiceRole.entities.JobPageEvent.create({
      tenant_id: tenantId,
      job_id: job.job_id,
      event_type: "page_view",
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

    // Fetch tenant branding
    let branding = { ...DEFAULT_BRANDING };
    try {
      const settingsRes = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
      const settings = (settingsRes?.data ?? settingsRes ?? [])[0];
      if (settings) {
        branding = {
          ...branding,
          company_name: settings.company_name || DEFAULT_BRANDING.company_name,
          logo_url: settings.logo_url || DEFAULT_BRANDING.logo_url,
          primary_color: settings.primary_color || DEFAULT_BRANDING.primary_color,
          accent_color: settings.accent_color || DEFAULT_BRANDING.accent_color,
          career_company_slug: settings.career_company_slug || "",
        };
      }
    } catch {}

    return Response.json({
      job: {
        job_id: job.job_id,
        public_slug: job.public_slug,
        title: job.title,
        department: job.department,
        description_text: job.description_text,
        responsibilities: job.responsibilities || [],
        required_qualifications: job.required_qualifications || [],
        preferred_qualifications: job.preferred_qualifications || [],
        skills: job.skills || [],
        experience_requirements: job.experience_requirements || "",
        performance_expectations: job.performance_expectations || [],
        compensation: job.compensation || "",
        work_schedule: job.work_schedule || "",
        page_description: job.page_description || "",
        design_spec: job.design_spec || null,
        employment_type: job.employment_type || "full_time",
        work_arrangement: job.work_arrangement || "onsite",
        location: job.location || "",
        travel_requirements: job.travel_requirements || "",
        benefits: job.benefits || [],
        published_at: job.published_at,
        status: job.status,
      },
      tenant: branding,
    });
  } catch (error) {
    console.error('getPublicJobPage error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}