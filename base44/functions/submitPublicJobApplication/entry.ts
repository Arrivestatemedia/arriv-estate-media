import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { waitUntil, secrets } from 'base44:runtime';
import { normalizeSource, emitRecruitingMutation } from '../../shared/careersHubShared.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      job_opening_id,
      full_name, email, phone, address, dob,
      linkedin, portfolio_link, last_related_job, why_good_fit,
      race, eeoc_agreed, signature,
      resume_url,
      source, utm_source, utm_medium, utm_campaign, utm_content,
      referrer_url, landing_page_url, first_touch_at, application_started_at,
      session_id,
    } = body;

    if (!job_opening_id) return Response.json({ error: 'Job opening ID is required' }, { status: 400 });
    if (!full_name || !email || !phone) return Response.json({ error: 'Full name, email, and phone are required' }, { status: 400 });

    const tenantId = "tnt_estate_media";

    // Find the JobOpening
    const jobRes = await base44.asServiceRole.entities.JobOpening.filter({ tenant_id: tenantId, job_id: job_opening_id });
    const jobList = jobRes?.data ?? jobRes ?? [];
    const job = Array.isArray(jobList) ? jobList[0] : null;
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (job.status === "closed" || job.status === "filled" || job.archived || job.public_visibility === false) {
      return Response.json({ error: 'This position is no longer accepting applications' }, { status: 400 });
    }

    // Duplicate check
    const dupRes = await base44.asServiceRole.entities.JobApplication.filter({
      job_opening_id: job_opening_id,
      email: email.toLowerCase(),
    });
    const dupList = dupRes?.data ?? dupRes ?? [];
    if (Array.isArray(dupList) && dupList.length > 0) {
      return Response.json({ error: 'An application with this email has already been submitted for this position.' }, { status: 409 });
    }

    // Normalize source server-side
    const normalizedSource = normalizeSource(source || utm_source);

    // Create the application
    const application = await base44.asServiceRole.entities.JobApplication.create({
      tenant_id: tenantId,
      job_opening_id: job_opening_id,
      full_name,
      email: email.toLowerCase(),
      phone,
      address: address || "",
      dob: dob || "",
      linkedin: linkedin || "",
      portfolio_link: portfolio_link || "",
      last_related_job: last_related_job || "",
      why_good_fit: why_good_fit || "",
      race: race || "",
      eeoc_agreed: eeoc_agreed || false,
      signature: signature || "",
      documents: resume_url ? [resume_url] : [],
      position: "general",
      source: "arriv_estate_media",
      application_source: normalizedSource,
      utm_source: utm_source || "",
      utm_medium: utm_medium || "",
      utm_campaign: utm_campaign || "",
      utm_content: utm_content || "",
      referrer_url: (referrer_url || "").substring(0, 500),
      landing_page_url: (landing_page_url || "").substring(0, 500),
      first_touch_at: first_touch_at || "",
      application_started_at: application_started_at || "",
      application_submitted_at: new Date().toISOString(),
      status: "received",
      origin_application: "arriv_estate_media",
    });

    // Record application_completed event (fire-and-forget)
    waitUntil(base44.asServiceRole.entities.JobPageEvent.create({
      tenant_id: tenantId,
      job_id: job_opening_id,
      event_type: "application_completed",
      source: normalizedSource,
      utm_source: utm_source || "",
      utm_medium: utm_medium || "",
      utm_campaign: utm_campaign || "",
      utm_content: utm_content || "",
      referrer_url: (referrer_url || "").substring(0, 500),
      landing_page_url: (landing_page_url || "").substring(0, 500),
      visitor_session_id: session_id || "",
    }).catch(() => {}));

    // Emit recruiting.mutation to Khetha
    const secret = secrets.get("ARRIV_ESTATE_MEDIA_SECRET") || "";
    const webhookUrl = "https://khetha-iq-by-arriv.base44.app/functions/estateMediaIntegrationWebhook";
    if (secret) {
      waitUntil(emitRecruitingMutation(tenantId, "job_application.submitted", {
        idempotency_key: application.id,
        job_id: job_opening_id,
        application_id: application.id,
        full_name,
        email: email.toLowerCase(),
        phone,
        address: address || "",
        dob: dob || "",
        linkedin: linkedin || "",
        portfolio_link: portfolio_link || "",
        last_related_job: last_related_job || "",
        why_good_fit: why_good_fit || "",
        race: race || "",
        eeoc_agreed: eeoc_agreed || false,
        signature: signature || "",
        resume_url: resume_url || "",
        application_source: normalizedSource,
        utm_source: utm_source || "",
        utm_medium: utm_medium || "",
        utm_campaign: utm_campaign || "",
        utm_content: utm_content || "",
        referrer_url: (referrer_url || "").substring(0, 500),
        landing_page_url: (landing_page_url || "").substring(0, 500),
        first_touch_at: first_touch_at || "",
        application_started_at: application_started_at || "",
        application_submitted_at: application_submitted_at || "",
      }, secret, webhookUrl));
    }

    return Response.json({ success: true, application_id: application.id });
  } catch (error) {
    console.error('submitPublicJobApplication error:', error);
    return Response.json({ error: error.message || 'Unknown error' }, { status: 500 });
  }
}