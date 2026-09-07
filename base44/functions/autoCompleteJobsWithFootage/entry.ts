import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { releaseEditingTasksForJob, ensureEditingTasksForJob, updateJobProductionStatus } from '../../shared/editingQueueEngine.ts';

// Extracts the Google Drive folder ID from a Drive folder URL.
function extractFolderId(url) {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const accessToken = await base44.asServiceRole.connectors.getAccessToken('googledrive');

    // Jobs where the partner said "I've completed the job" but hasn't confirmed footage upload.
    const jobs = await base44.asServiceRole.entities.Job.filter({
      media_partner_status: 'job_completed',
      footage_uploaded: false
    });

    // Only consider booking jobs that are still in progress (not already completed/cancelled).
    const candidates = jobs.filter(j =>
      j.from_booking === true &&
      j.google_drive_folder_url &&
      j.status !== 'completed' &&
      j.status !== 'cancelled'
    );

    const autoCompleted = [];
    const skipped = [];

    for (const job of candidates) {
      const folderId = extractFolderId(job.google_drive_folder_url);
      if (!folderId) {
        skipped.push({ id: job.id, reason: 'No folder ID in URL' });
        continue;
      }

      // List files inside the folder (trashed=false so we don't count deleted files).
      let hasFiles = false;
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=1`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          hasFiles = Array.isArray(data.files) && data.files.length > 0;
        } else {
          console.warn(`Drive list failed for job ${job.id}:`, await res.text());
        }
      } catch (e) {
        console.warn(`Drive error for job ${job.id}:`, e.message);
      }

      if (hasFiles) {
        const now = new Date().toISOString();
        const folderId = extractFolderId(job.google_drive_folder_url);

        // ── PAYOUT-PRESERVING STATUS TRANSITION ──
        // Do NOT set status='completed' here. The overall Job.status only reaches
        // 'completed' when ALL customer fulfillment (including post-production +
        // delivery) is done. Instead, set media_partner_fulfillment_status=
        // 'completed' — this is the PAYOUT ELIGIBILITY field. Media Partner
        // payouts are based on this field, NOT Job.status.
        //
        // Set status='in_progress' to indicate post-production is underway.
        // Set source_upload_status='complete' and capture_fulfillment_completed_at.
        await base44.asServiceRole.entities.Job.update(job.id, {
          footage_uploaded: true,
          status: 'in_progress',
          media_partner_fulfillment_status: 'completed',
          capture_fulfillment_completed_at: now,
          source_upload_status: 'complete',
          source_storage_provider: 'GOOGLE_DRIVE',
          source_storage_folder_id: folderId,
        });

        // ── EDITING QUEUE INTEGRATION ──
        // Source media confirmed → create editing tasks (if not yet created) and
        // release them from WAITING_FOR_UPLOAD → READY_FOR_EDITING.
        // The release function attaches the existing Google Drive folder references
        // to each task (no duplicate folders created) and updates job production_status.
        try {
          await ensureEditingTasksForJob(base44, job, 'system');
          await releaseEditingTasksForJob(base44, job.id, job.google_drive_folder_url, 'system');
        } catch (editErr) {
          console.warn(`Editing task release failed for job ${job.id}:`, editErr.message);
        }

        autoCompleted.push({ id: job.id, location: job.location, booked_by: job.booked_by });
      }
    }

    return Response.json({
      success: true,
      checked: candidates.length,
      autoCompleted: autoCompleted.length,
      autoCompletedDetails: autoCompleted,
      skipped
    });
  } catch (error) {
    console.error('autoCompleteJobsWithFootage error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});