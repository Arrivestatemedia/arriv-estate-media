import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { action, settings: settingsData } = body;

    const tenantId = "tnt_estate_media";

    if (action === "get") {
      const res = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
      const list = res?.data ?? res ?? [];
      const settings = Array.isArray(list) ? list[0] : null;
      return Response.json({ settings: settings || { tenant_id: tenantId, career_page_enabled: false } });
    }

    if (action === "save") {
      // Find existing or create new
      const res = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
      const list = res?.data ?? res ?? [];
      const existing = Array.isArray(list) ? list[0] : null;

      const data = {
        tenant_id: tenantId,
        career_page_enabled: settingsData.career_page_enabled ?? false,
        career_company_slug: settingsData.career_company_slug || "",
        career_company_description: settingsData.career_company_description || "",
        career_hero_image: settingsData.career_hero_image || "",
        career_culture_text: settingsData.career_culture_text || "",
        career_benefits: settingsData.career_benefits || [],
        career_locations: settingsData.career_locations || [],
        career_social_links: settingsData.career_social_links || {},
        career_contact_email: settingsData.career_contact_email || "",
        company_name: settingsData.company_name || "Arriv Estate Media",
        logo_url: settingsData.logo_url || "",
        primary_color: settingsData.primary_color || "#B8956A",
        accent_color: settingsData.accent_color || "",
        custom_domain: settingsData.custom_domain || "",
      };

      if (existing) {
        const updated = await base44.asServiceRole.entities.CareersHubSetting.update(existing.id, data);
        return Response.json({ success: true, settings: updated });
      } else {
        const created = await base44.asServiceRole.entities.CareersHubSetting.create(data);
        return Response.json({ success: true, settings: created });
      }
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('manageCareersHubSettings error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}