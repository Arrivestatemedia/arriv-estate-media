import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  ACCESS_ON_SITE,
  ACCESS_LOCKBOX,
  applyClientAccessSelection,
  accessSelectionDisplay,
} from '../../shared/clientAccessSelection.ts';

/**
 * manageClientAccessSelection
 * Web entry point for a client to choose how their media specialist will
 * access the property. Verifies the caller owns the job (by client_email),
 * records the selection, and sends the confirmation SMS.
 *
 * Payload: { jobId, selection: 'on_site' | 'lockbox', clientEmail }
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, selection, clientEmail } = await req.json();

    if (!jobId || !selection || !clientEmail) {
      return Response.json({ error: 'jobId, selection, and clientEmail are required' }, { status: 400 });
    }
    if (selection !== ACCESS_ON_SITE && selection !== ACCESS_LOCKBOX) {
      return Response.json({ error: 'Invalid selection' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify the caller is the client for this job
    if ((job.client_email || '').toLowerCase() !== (clientEmail || '').toLowerCase()) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const display = await applyClientAccessSelection(base44, job, selection, 'web');

    return Response.json({
      success: true,
      selection,
      display,
      selection_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('manageClientAccessSelection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}