import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import { loadMlsProviders, getProvider } from '../../shared/mlsProviders.ts';
import { notifyCustomerMlsCompleted, notifyAdminAlert } from '../../shared/mlsNotifications.ts';
import { formatEtDeadline } from '../../shared/mlsServiceWindow.ts';

/**
 * manageMlsUploadRequest
 * The administrative side of an MLS upload: move the request through its own lifecycle.
 *
 * Photographs and video are tracked separately because FMLS treats them as two different tasks
 * (bulk photo upload, then a virtual tour URL). A request is only "completed" once every selected
 * medium has actually been addressed — never on the administrator's word alone for one of them.
 *
 * Nothing here writes to Job, Booking or the delivery pipeline.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { requestId, action, note, reason, actor: actorHint } = body || {};

    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: 403 });

    if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });
    if (!action) return Response.json({ error: 'action is required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({ request_id: requestId }, undefined, 1);
    const request = rows?.[0];
    if (!request) return Response.json({ error: 'MLS request not found' }, { status: 404 });

    const actor = auth.actorEmail || actorHint || auth.actor || 'admin';
    const now = new Date();
    const history = Array.isArray(request.status_history) ? [...request.status_history] : [];
    const provider = getProvider(await loadMlsProviders(base44), request.provider);
    const job = await base44.asServiceRole.entities.Job.get(request.job_id).catch(() => null);

    const patch: Record<string, any> = {};
    let customerNotifiedNow = false;

    const pushHistory = (status: string, historyNote: string) => {
      history.push({ status, at: now.toISOString(), actor, note: historyNote });
      patch.status_history = history;
    };

    switch (action) {
      case 'processing': {
        if (['completed', 'cancelled'].includes(String(request.status))) {
          return Response.json({ error: 'This request is already closed.' }, { status: 409 });
        }
        patch.status = 'processing';
        patch.processing_started_at = request.processing_started_at || now.toISOString();
        pushHistory('processing', note || 'Administrator started the MLS upload');
        break;
      }

      case 'photos_uploaded': {
        if (['completed', 'cancelled'].includes(String(request.status))) {
          return Response.json({ error: 'This request is already closed.' }, { status: 409 });
        }
        patch.photo_upload_status = 'uploaded';
        patch.processing_started_at = request.processing_started_at || now.toISOString();
        const videoStillPending = request.video_upload_status === 'pending';
        patch.status = videoStillPending ? 'photos_uploaded' : 'photos_uploaded';
        pushHistory('photos_uploaded', note || `${request.photo_count || 0} photographs uploaded to ${provider?.short_label || 'the MLS'}`);

        // Tell the customer their photos are live while the video link is still being added.
        if (videoStillPending && !request.client_notified_at) {
          try {
            await notifyCustomerMlsCompleted(base44, { request: { ...request, ...patch }, job, videoPending: true });
            patch.client_notified_at = now.toISOString();
            customerNotifiedNow = true;
          } catch (err: any) {
            console.error('Customer partial notification failed:', err?.message || err);
          }
        }
        break;
      }

      case 'video_added': {
        if (['completed', 'cancelled'].includes(String(request.status))) {
          return Response.json({ error: 'This request is already closed.' }, { status: 409 });
        }
        if (request.video_upload_status === 'not_required') {
          return Response.json({ error: 'No video was selected on this request.' }, { status: 400 });
        }
        patch.video_upload_status = 'added';
        patch.status = request.photo_upload_status === 'pending' ? 'video_added' : 'video_added';
        pushHistory('video_added', note || 'Unbranded video URL added to the listing');
        break;
      }

      case 'complete': {
        if (String(request.status) === 'completed') {
          return Response.json({ error: 'This request is already completed.' }, { status: 409 });
        }
        const photoStatus = patch.photo_upload_status || request.photo_upload_status;
        const videoStatus = patch.video_upload_status || request.video_upload_status;
        const photosAddressed = photoStatus === 'uploaded' || photoStatus === 'not_required';
        const videoAddressed = videoStatus === 'added' || videoStatus === 'not_required';

        if (!photosAddressed) {
          return Response.json({ error: 'Mark the photographs uploaded before completing the request.' }, { status: 400 });
        }
        if (!videoAddressed) {
          return Response.json({
            error: 'The selected video has not been added yet. Mark the video added, or leave the request at Photos Uploaded.',
          }, { status: 400 });
        }

        const alreadyNotified = history.some((h: any) => h.status === 'completed');
        patch.status = 'completed';
        patch.completed_at = now.toISOString();
        patch.completed_by = actor;
        patch.photo_upload_status = photosAddressed ? photoStatus : patch.photo_upload_status;
        pushHistory('completed', note || 'Administrator confirmed the MLS upload is complete');

        if (!alreadyNotified) {
          try {
            await notifyCustomerMlsCompleted(base44, { request: { ...request, ...patch }, job, videoPending: false });
            patch.client_notified_at = now.toISOString();
            customerNotifiedNow = true;
          } catch (err: any) {
            console.error('Customer completion notification failed:', err?.message || err);
          }
        }
        break;
      }

      case 'needs_attention': {
        if (['completed', 'cancelled'].includes(String(request.status))) {
          return Response.json({ error: 'This request is already closed.' }, { status: 409 });
        }
        patch.status = 'needs_attention';
        patch.attention_reason = reason || note || 'Needs attention';
        pushHistory('needs_attention', patch.attention_reason);
        try {
          await notifyAdminAlert(base44, {
            subject: `MLS upload needs attention — ${request.property_address || 'property'}`,
            body: `MLS #${request.mls_number} (${provider?.short_label || request.provider}) is flagged: ${patch.attention_reason}\nCustomer: ${request.client_name || request.client_email}`,
            jobId: request.job_id,
          });
        } catch (err: any) {
          console.error('Needs-attention alert failed:', err?.message || err);
        }
        break;
      }

      case 'cancel': {
        if (String(request.status) === 'completed') {
          return Response.json({ error: 'A completed request cannot be cancelled.' }, { status: 409 });
        }
        patch.status = 'cancelled';
        pushHistory('cancelled', reason || note || 'Request cancelled');
        break;
      }

      case 'note': {
        // Notes never change status or notifications.
        break;
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const combinedNotes = [request.admin_notes, note].filter(Boolean).join('\n---\n');
    if (note && action !== 'needs_attention') patch.admin_notes = combinedNotes;

    const updated = Object.keys(patch).length > 0
      ? await base44.asServiceRole.entities.MlsUploadRequest.update(request.id, patch)
      : request;

    return Response.json({
      success: true,
      request: updated,
      deadline_label: formatEtDeadline(updated.deadline_at),
      customer_notified: customerNotifiedNow,
    });
  } catch (error: any) {
    console.error('manageMlsUploadRequest error:', error);
    return Response.json({ error: error?.message || 'Could not update the MLS request' }, { status: 500 });
  }
});