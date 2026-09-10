import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { generateJobId, slugify, emitRecruitingMutation } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

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
    } = body;

    if (action === "analyze") {
      // Step 2: AI analysis of the job description
      let prompt = `You are an expert HR analyst. Extract structured job information from the following job description.\n\n`;
      if (page_description) {
        prompt += `Additional context from the hiring manager: ${page_description}\n\n`;
      }
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
          },
        },
      });

      const extracted = llmRes || {};
      return Response.json({ success: true, extracted });
    }

    // action === "update"
    if (action === "update") {
      if (!job_opening_id) return Response.json({ error: 'job_opening_id is required' }, { status: 400 });
      if (!title) return Response.json({ error: 'Title is required' }, { status: 400 });

      // Fetch the existing record so we can preserve fields that aren't
      // explicitly provided in the update — prevents overriding existing
      // design elements with empty defaults.
      const existing = await base44.asServiceRole.entities.JobOpening.get(job_opening_id);
      const existingData = existing?.data ?? existing ?? {};

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

    const createdBy = user.full_name || user.email || "Admin";

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

    const origin = typeof window !== 'undefined' ? window.location.origin : `https://${req.headers.get('host') || 'arrivestatemedia.base44.app'}`;
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