import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { loadMlsProviders, enabledProviders } from '../../shared/mlsProviders.ts';
import { loadMlsServiceWindow, formatEtDeadline, describeWindow, businessMinutesBetween } from '../../shared/mlsServiceWindow.ts';
import { ownsJob, resolvePropertyAddress } from '../../shared/mlsJobContext.ts';
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
    const { mode = 'client', jobId, clientEmail, status } = body || {};

    const providers = await loadMlsProviders(base44);
    const window = await loadMlsServiceWindow(base44);

    if (mode === 'admin') {
      const auth = await verifyAdmin(base44, body, new URL(req.url));
      if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

      const query: Record<string, any> = {};
      if (status && status !== 'all') query.status = status;
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

      return Response.json({
        requests: enriched,
        providers: Object.values(providers),
        window_label: describeWindow(window),
        window,
        app_url: await resolveAppUrl(base44),
        server_now: now.toISOString(),
      });
    }

    // ---- client mode ----
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    if (!clientEmail) return Response.json({ error: 'clientEmail is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });
    if (!ownsJob(job, clientEmail)) {
      return Response.json({ error: 'Unauthorized: this job does not belong to you' }, { status: 403 });
    }

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ job_id: jobId }, '-submitted_at', 50);

    return Response.json({
      requests: (rows || []).map((r: any) => ({
        ...r,
        deadline_label: formatEtDeadline(r.deadline_at),
      })),
      providers: enabledProviders(providers).map((p) => ({
        id: p.id,
        label: p.label,
        short_label: p.short_label,
        photo_limit: p.photo_limit,
        number_hint: p.number_hint,
        video_requirement_note: p.video_requirement_note,
      })),
      window_label: describeWindow(window),
      service_hours: window.service_hours,
      property_address: await resolvePropertyAddress(base44, job),
    });
  } catch (error: any) {
    console.error('getMlsUploadRequests error:', error);
    return Response.json({ error: error?.message || 'Could not load MLS requests' }, { status: 500 });
  }
});