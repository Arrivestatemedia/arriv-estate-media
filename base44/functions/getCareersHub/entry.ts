import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { DEFAULT_BRANDING } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { company_slug, host } = body;

    const tenantId = "tnt_estate_media";

    // Fetch tenant branding
    let branding = { ...DEFAULT_BRANDING };
    try {
      const settingsRes = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
      const settings = (settingsRes?.data ?? settingsRes ?? [])[0];
      if (settings) {
        branding = {
          company_name: settings.company_name || DEFAULT_BRANDING.company_name,
          logo_url: settings.logo_url || DEFAULT_BRANDING.logo_url,
          primary_color: settings.primary_color || DEFAULT_BRANDING.primary_color,
          accent_color: settings.accent_color || DEFAULT_BRANDING.accent_color,
          career_company_slug: settings.career_company_slug || "",
          career_company_description: settings.career_company_description || "",
          career_hero_image: settings.career_hero_image || "",
          career_culture_text: settings.career_culture_text || "",
          career_benefits: settings.career_benefits || [],
          career_locations: settings.career_locations || [],
          career_social_links: settings.career_social_links || {},
          career_contact_email: settings.career_contact_email || "",
          custom_domain: settings.custom_domain || "",
        };
      }
    } catch {}

    // Check if careers page is enabled
    const settingsRes = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
    const settings = (settingsRes?.data ?? settingsRes ?? [])[0];
    if (settings && settings.career_page_enabled === false) {
      return Response.json({ error: 'Careers page is not enabled' }, { status: 404 });
    }

    // Fetch open, visible, non-archived jobs
    const jobsRes = await base44.asServiceRole.entities.JobOpening.filter({
      tenant_id: tenantId,
      status: "open",
      public_visibility: true,
      archived: false,
    }, "-published_at", 100);
    const allJobs = jobsRes?.data ?? jobsRes ?? [];

    const jobs = (Array.isArray(allJobs) ? allJobs : []).map(j => ({
      job_id: j.job_id,
      public_slug: j.public_slug,
      title: j.title,
      department: j.department,
      location: j.location,
      employment_type: j.employment_type,
      work_arrangement: j.work_arrangement,
      compensation: j.compensation,
      work_schedule: j.work_schedule,
      description_text: (j.description_text || "").substring(0, 280),
      published_at: j.published_at,
    }));

    return Response.json({ tenant: branding, jobs });
  } catch (error) {
    console.error('getCareersHub error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}