import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { generateJobId, slugify, emitRecruitingMutation } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      action, // "create" | "analyze" | "update"
      job_opening_id, // for "update" action
      page_description,
      design_description,
      source_type, // "text" | "url" | "file"
      source_text,
      source_url,
      file_url,
      // reviewed fields (for "create" action)
      title, department, description, responsibilities, required_qualifications,
      preferred_qualifications, skills, experience_requirements,
      performance_expectations, compensation, work_schedule,
      employment_type, work_arrangement, location, travel_requirements,
      benefits,
      email: bodyEmail,
      design_spec: bodyDesignSpec,
    } = body;

    const base44 = createClientFromRequest(req);

    // Dual auth: sales admins log in via SalesLogin (custom auth) and may not
    // have a platform session token, so auth.me() can throw. Try platform auth
    // first, then fall back to SalesTeamMember lookup by email.
    let isAdmin = false;
    let actorName = "Admin";
    try {
      const user = await base44.auth.me();
      if (user) {
        isAdmin = user.role === 'admin';
        actorName = user.full_name || user.email || "Admin";
      }
    } catch (e) { /* no platform session — try sales admin below */ }

    if (!isAdmin && bodyEmail) {
      try {
        const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: bodyEmail });
        const list = members?.data ?? members ?? [];
        const member = Array.isArray(list) && list.length > 0 ? list[0] : null;
        if (member && member.role === 'admin') {
          isAdmin = true;
          actorName = member.full_name || member.email || "Admin";
        }
      } catch (e) { /* ignore */ }
    }

    if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (action === "analyze") {
      // Step 2: AI analysis of the job description
      let prompt = `You are an expert HR analyst. Extract structured job information from the following job description.\n\n`;
      if (page_description) {
        prompt += `Additional context from the hiring manager: ${page_description}\n\n`;
      }
      if (design_description) {
        prompt += `Design direction from the hiring manager: ${design_description}\n\n`;
      }
      prompt += `Also generate a "design_spec" object describing the visual page design. Extract EVERY visual property the design direction mentions:\n`;
      prompt += `- hero_style: one of "full_bleed" (dark dramatic hero), "centered" (centered text focus), "split" (two-column with info card), "minimal" (simple, light)\n`;
      prompt += `- primary_color: hex color for buttons/accents (e.g. "#B8956A")\n`;
      prompt += `- secondary_color: hex color for hero/section backgrounds (e.g. "#1A1A1A")\n`;
      prompt += `- accent_color: hex color for icons, badges, and highlights — set when the design mentions a distinct accent/highlight color; omit if not mentioned\n`;
      prompt += `- background_tone: one of "light", "dark", "warm"\n`;
      prompt += `- section_order: array ordering these section keys: "about", "responsibilities", "qualifications", "preferred", "experience", "performance", "skills", "benefits", "compensation"\n`;
      prompt += `- layout_density: one of "spacious", "compact"\n`;
      prompt += `- tone: one of "professional", "warm", "modern", "classic"\n`;
      prompt += `- font_family: one of "serif" (Georgia), "sans" (Inter), "mono" (monospace) — body text font; set when the design mentions a font style\n`;
      prompt += `- heading_font_family: one of "serif", "sans", "mono" — heading font; set only when the design explicitly mentions heading typography\n`;
      prompt += `- hero_image_url: URL string — set ONLY when the design description provides a specific image URL\n`;
      prompt += `- button_style: one of "rounded" (default), "pill" (fully rounded), "square" (sharp corners), "ghost" (transparent with colored border)\n`;
      prompt += `- card_style: one of "elevated" (shadow), "bordered" (thin border, default), "flat" (no border/shadow), "tinted" (subtle color fill)\n`;
      prompt += `- content_width: one of "narrow", "standard" (default), "wide"\n`;
      prompt += `- show_logo: true/false — whether to show the company logo (default true); set false when the design says to hide the logo\n`;
      prompt += `- show_badge: true/false — whether to show the "Now Hiring" badge (default true); set false when the design says to hide it\n`;
      prompt += `Base the ENTIRE design_spec on the design direction above. Map every visual detail the user described to the corresponding field. If no design direction was given, use defaults: hero_style "full_bleed", primary_color "#B8956A", secondary_color "#1A1A1A", background_tone "light", layout_density "spacious", tone "classic", button_style "rounded", card_style "bordered", content_width "standard", show_logo true, show_badge true.\n\n`;
      if (source_type === "url" && source_url) {
        prompt += `Job description URL: ${source_url}\n\nPlease use the URL content as the primary source.`;
      } else if (source_type === "file" && file_url) {
        prompt += `Job description is provided as an uploaded file.`;
      } else {
        prompt += `Job description text:\n${source_text || ""}`;
      }

      const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: source_type === "url",
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            department: { type: "string" },
            description: { type: "string" },
            responsibilities: { type: "array", items: { type: "string" } },
            required_qualifications: { type: "array", items: { type: "string" } },
            preferred_qualifications: { type: "array", items: { type: "string" } },
            skills: { type: "array", items: { type: "string" } },
            experience_requirements: { type: "string" },
            performance_expectations: { type: "array", items: { type: "string" } },
            compensation: { type: "string" },
            work_schedule: { type: "string" },
            design_spec: {
              type: "object",
              properties: {
                hero_style: { type: "string" },
                primary_color: { type: "string" },
                secondary_color: { type: "string" },
                accent_color: { type: "string" },
                background_tone: { type: "string" },
                section_order: { type: "array", items: { type: "string" } },
                layout_density: { type: "string" },
                tone: { type: "string" },
                font_family: { type: "string" },
                heading_font_family: { type: "string" },
                hero_image_url: { type: "string" },
                button_style: { type: "string" },
                card_style: { type: "string" },
                content_width: { type: "string" },
                show_logo: { type: "boolean" },
                show_badge: { type: "boolean" },
              },
            },
          },
        },
      });

      const extracted = llmRes || {};
      return Response.json({ success: true, extracted, design_spec: extracted.design_spec || null });
    }

    // action === "update"
    if (action === "update") {
      if (!job_opening_id) return Response.json({ error: 'job_opening_id is required' }, { status: 400 });

      // Fetch the existing record so we can preserve fields that aren't
      // explicitly provided in the update — prevents overriding existing
      // design elements with empty defaults.
      const existing = await base44.asServiceRole.entities.JobOpening.get(job_opening_id);
      const existingData = existing?.data ?? existing ?? {};

      if (!title && !existingData.title) return Response.json({ error: 'Title is required' }, { status: 400 });

      const updateData = {
        title: title || existingData.title || "",
        department: department || existingData.department || "",
        description_text: description || existingData.description_text || "",
        responsibilities: responsibilities || existingData.responsibilities || [],
        required_qualifications: required_qualifications || existingData.required_qualifications || [],
        preferred_qualifications: preferred_qualifications || existingData.preferred_qualifications || [],
        skills: skills || existingData.skills || [],
        experience_requirements: experience_requirements || existingData.experience_requirements || "",
        performance_expectations: performance_expectations || existingData.performance_expectations || [],
        compensation: compensation || existingData.compensation || "",
        work_schedule: work_schedule || existingData.work_schedule || "",
        employment_type: employment_type || existingData.employment_type || "full_time",
        work_arrangement: work_arrangement || existingData.work_arrangement || "onsite",
        location: location || existingData.location || "",
        travel_requirements: travel_requirements || existingData.travel_requirements || "",
        benefits: benefits || existingData.benefits || [],
        page_description: page_description || existingData.page_description || "",
        design_description: design_description || existingData.design_description || "",
        design_spec: bodyDesignSpec || existingData.design_spec || null,
        source_url: source_url || existingData.source_url || "",
        public_visibility: body.public_visibility !== undefined ? body.public_visibility : (existingData.public_visibility !== false),
        status: body.status || existingData.status || "open",
      };

      const updated = await base44.asServiceRole.entities.JobOpening.update(job_opening_id, updateData);

      // Emit recruiting.mutation to Khetha
      const secret = secrets.get("ARRIV_ESTATE_MEDIA_SECRET") || "";
      const webhookUrl = "https://khetha-iq-by-arriv.base44.app/functions/estateMediaIntegrationWebhook";
      if (secret) {
        await emitRecruitingMutation("tnt_estate_media", "job_opening.updated", {
          idempotency_key: `update-${job_opening_id}-${Date.now()}`,
          job_id: updated?.job_id || "",
          title,
          department: department || "",
          description_text: description || "",
          responsibilities: responsibilities || [],
          required_qualifications: required_qualifications || [],
          preferred_qualifications: preferred_qualifications || [],
          skills: skills || [],
          experience_requirements: experience_requirements || "",
          compensation: compensation || "",
          work_schedule: work_schedule || "",
          employment_type: employment_type || "full_time",
          work_arrangement: work_arrangement || "onsite",
          location: location || "",
          public_slug: updated?.public_slug || "",
          page_description: page_description || "",
          design_description: design_description || "",
          public_visibility: updateData.public_visibility,
          status: updateData.status,
        }, secret, webhookUrl).catch(() => {});
      }

      return Response.json({ success: true, job_opening: updated });
    }

    // action === "create"
    if (!title) return Response.json({ error: 'Title is required' }, { status: 400 });

    const tenantId = "tnt_estate_media";
    const jobId = generateJobId();
    let publicSlug = slugify(title);

    // Ensure slug uniqueness
    const existing = await base44.asServiceRole.entities.JobOpening.filter({ tenant_id: tenantId, public_slug: publicSlug });
    const existingList = existing?.data ?? existing ?? [];
    if (Array.isArray(existingList) && existingList.length > 0) {
      publicSlug = `${publicSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const createdBy = actorName;

    const jobOpening = await base44.asServiceRole.entities.JobOpening.create({
      tenant_id: tenantId,
      job_id: jobId,
      public_slug: publicSlug,
      page_description: page_description || "",
      design_description: design_description || "",
      title,
      department: department || "",
      description_text: description || "",
      source_url: source_url || "",
      source_type: source_type || "text",
      responsibilities: responsibilities || [],
      required_qualifications: required_qualifications || [],
      preferred_qualifications: preferred_qualifications || [],
      skills: skills || [],
      experience_requirements: experience_requirements || "",
      performance_expectations: performance_expectations || [],
      compensation: compensation || "",
      work_schedule: work_schedule || "",
      employment_type: employment_type || "full_time",
      work_arrangement: work_arrangement || "onsite",
      location: location || "",
      travel_requirements: travel_requirements || "",
      benefits: benefits || [],
      design_spec: bodyDesignSpec || null,
      public_visibility: true,
      published_at: new Date().toISOString(),
      status: "open",
      created_by_name: createdBy,
      origin_application: "arriv_estate_media",
    });

    // Emit recruiting.mutation to Khetha
    const secret = secrets.get("ARRIV_ESTATE_MEDIA_SECRET") || "";
    const webhookUrl = "https://khetha-iq-by-arriv.base44.app/functions/estateMediaIntegrationWebhook";
    if (secret) {
      await emitRecruitingMutation(tenantId, "job_opening.created", {
        idempotency_key: jobId,
        job_id: jobId,
        title,
        department: department || "",
        description_text: description || "",
        responsibilities: responsibilities || [],
        required_qualifications: required_qualifications || [],
        preferred_qualifications: preferred_qualifications || [],
        skills: skills || [],
        experience_requirements: experience_requirements || "",
        compensation: compensation || "",
        work_schedule: work_schedule || "",
        employment_type: employment_type || "full_time",
        work_arrangement: work_arrangement || "onsite",
        location: location || "",
        public_slug: publicSlug,
        page_description: page_description || "",
        public_visibility: true,
        status: "open",
      }, secret, webhookUrl);
    }

    // Use the custom domain for public URLs when configured
    let origin = typeof window !== 'undefined' ? window.location.origin : `https://${req.headers.get('host') || 'arrivestatemedia.base44.app'}`;
    try {
      const settingsRes = await base44.asServiceRole.entities.CareersHubSetting.filter({ tenant_id: tenantId });
      const hubSettings = (settingsRes?.data ?? settingsRes ?? [])[0];
      if (hubSettings?.custom_domain) {
        origin = `https://${hubSettings.custom_domain.replace(/^https?:\/\//, "")}`;
      }
    } catch {}
    const publicUrl = `${origin}/careers/${publicSlug || jobId}`;

    return Response.json({
      success: true,
      job_opening: jobOpening,
      public_url: publicUrl,
    });
  } catch (error) {
    console.error('createJobPage error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}