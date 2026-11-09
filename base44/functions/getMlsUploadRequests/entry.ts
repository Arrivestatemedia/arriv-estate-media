import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { loadMlsProviders, isProviderLiveForCustomers } from '../../shared/mlsProviders.ts';
import { loadMlsServiceWindow, formatEtDeadline, describeWindow, businessMinutesBetween, computeMlsDeadline } from '../../shared/mlsServiceWindow.ts';
import { ownsJob, resolvePropertyAddress, resolvePropertyLocation } from '../../shared/mlsJobContext.ts';
import { loadMlsServiceRegions, resolveMlsRegion, describeRouting } from '../../shared/mlsRegions.ts';
import { resolveAppUrl } from '../../shared/mlsNotifications.ts';

/**
 * getMlsUploadRequests
 * Reads MLS upload requests for the two audiences that need them:
 *   mode "client" — the customer's own requests for one job (verified against job.client_email)
 *   mode "admin"  — the administrative queue (verifyAdmin)
 * Also returns the provider registry and the service window, so the customer modal can show the
 * real deadline before submitting and the queue can show the real working window.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { mode = 'client', jobId, clientEmail, status, estimateDeadline } = body || {};

    const providers = await loadMlsProviders(base44);
    const window = await loadMlsServiceWindow(base44);

    if (mode === 'admin') {
      const auth = await verifyAdmin(base44, body, new URL(req.url));
      if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

      const query: Record<string, any> = {};
      if (status && status !== 'all') query.status = status;
      if (jobId) query.job_id = jobId;
      const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter(query, '-submitted_at', 200);

      const now = new Date();
      const enriched = (rows || []).map((r: any) => {
        const deadline = r.deadline_at ? new Date(r.deadline_at) : null;
        const open = !['completed', 'cancelled'].includes(String(r.status));
        return {
          ...r,
          deadline_label: formatEtDeadline(deadline),
          business_minutes_used: r.submitted_at ? businessMinutesBetween(new Date(r.submitted_at), now, window) : 0,
          minutes_remaining: deadline ? Math.round((deadline.getTime() - now.getTime()) / 60000) : null,
          is_overdue: !!(open && deadline && deadline < now),
          open,
        };
      });

      const regions = await loadMlsServiceRegions(base44);

      return Response.json({
        requests: enriched,
        providers: Object.values(providers),
        regions,
        window_label: describeWindow(window),
        window,
        app_url: await resolveAppUrl(base44),
        server_now: now.toISOString(),
      });
    }

    // ---- client mode ----
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    if (!clientEmail) return Response.json({ error: 'clientEmail is required' }, { status: 400 });

    // A removed or mistyped gallery link is a clean "not found", not a server error.
    let job: any = null;
    try {
      job = await base44.asServiceRole.entities.Job.get(jobId);
    } catch {
      job = null;
    }
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (!ownsJob(job, clientEmail)) {
      return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
    }

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ job_id: jobId }, '-submitted_at', 50);

    // The gallery needs to know which delivered videos already have a ready unlisted link.
    const youtubeRows = await base44.asServiceRole.entities.YouTubeVideoUpload.filter({ job_id: jobId }, '-created_date', 100);
    const youtube = (youtubeRows || []).map((u: any) => ({
      drive_file_id: u.drive_file_id,
      upload_status: u.upload_status,
      youtube_url: u.upload_status === 'ready' ? u.youtube_url : '',
      error_message: u.error_message || '',
    }));

    // Which MLS this property belongs to. The customer is never shown a provider to choose from —
    // the booking address decides, and only that area's workflow is returned.
    const propertyLocation = await resolvePropertyLocation(base44, job);
    const regions = await loadMlsServiceRegions(base44);
    const resolution = resolveMlsRegion(regions, propertyLocation, (providerId: string) =>
      isProviderLiveForCustomers(providers[providerId] || null));
    const applicable = resolution.provider_id ? providers[resolution.provider_id] : null;

    const routing = {
      status: resolution.status,
      reason: resolution.reason,
      basis: resolution.basis,
      provider_id: resolution.provider_id,
      provider_label: applicable?.label || null,
      provider_short_label: applicable?.short_label || null,
      provider_live: resolution.provider_live,
      region_id: resolution.region_id,
      region_label: resolution.region_label,
      requires_listing_number: applicable ? applicable.requires_listing_number !== false : false,
      requires_authorization: applicable ? applicable.requires_authorization !== false : true,
      photo_limit: applicable?.photo_limit || null,
      number_hint: applicable?.number_hint || '',
      number_pattern: applicable?.number_pattern || '',
      video_requirement_note: applicable?.video_requirement_note || '',
      message: describeRouting(resolution, applicable?.label),
      // Always submittable: an address the map cannot name yet still becomes a request our MLS team
      // publishes by hand. No property is ever told MLS publishing is unavailable.
      can_submit: true,
    };

    const estimatedDeadline = estimateDeadline ? computeMlsDeadline(new Date(), window) : null;

    return Response.json({
      requests: (rows || []).map((r: any) => ({
        ...r,
        deadline_label: formatEtDeadline(r.deadline_at),
      })),
      routing,
      providers: applicable ? [{
        id: applicable.id,
        label: applicable.label,
        short_label: applicable.short_label,
        photo_limit: applicable.photo_limit,
        number_hint: applicable.number_hint,
        number_pattern: applicable.number_pattern,
        video_requirement_note: applicable.video_requirement_note,
      }] : [],
      window_label: describeWindow(window),
      service_hours: window.service_hours,
      estimated_deadline_label: estimatedDeadline ? formatEtDeadline(estimatedDeadline) : null,
      youtube,
      property_address: await resolvePropertyAddress(base44, job),
      property_location: propertyLocation,
    });
  } catch (error: any) {
    console.error('getMlsUploadRequests error:', error);
    return Response.json({ error: error?.message || 'Could not load MLS requests' }, { status: 500 });
  }
});