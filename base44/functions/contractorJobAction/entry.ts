import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveRecordActor } from '../../shared/recordAccess.ts';
import {
  evaluateContractorAction,
  actionPatch,
  safeJobActionPayload,
} from '../../shared/contractorJobActions.ts';

/**
 * The only browser path for a contractor to write to a Job.
 *
 * Job writes are administrator-only, so the two actions a media partner really
 * performs are served here instead of by a direct entity update:
 *
 *   book_backup  -> offer to back up an open/booked booking-sourced gig
 *   on_my_way    -> the assigned partner (primary or backup) starts travelling
 *
 * Identity comes from the signed customer session, so the backup contact details
 * are the signed-in partner's own — a browser cannot set them to someone else.
 * Job state is checked before anything is written, and only the fields named in
 * actionPatch() are ever patched.
 */

const ALLOWED_ACTIONS = ['book_backup', 'on_my_way'];

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const action = String(body.action || '');
  if (!ALLOWED_ACTIONS.includes(action)) {
    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  }

  const jobId = String(body.job_id || '').trim();
  if (!jobId) {
    return Response.json({ error: 'A gig is required.' }, { status: 400 });
  }

  const actor = await resolveRecordActor(base44, req, body);
  if (!actor) {
    return Response.json({ error: 'Not authorized.' }, { status: 401 });
  }

  if (actor.kind !== 'contractor') {
    return Response.json({ error: 'Only media partners can use this action.' }, { status: 403 });
  }

  const jobs = base44.asServiceRole.entities.Job;

  let job: any = null;
  try {
    job = await jobs.get(jobId);
  } catch {
    job = null;
  }
  if (!job) {
    return Response.json({ error: 'That gig could not be found.' }, { status: 404 });
  }

  const decision = evaluateContractorAction(job, actor.email, action);
  if (!decision.allowed) {
    return Response.json({ error: decision.reason }, { status: decision.status });
  }

  try {
    const patch = actionPatch(action, { email: actor.email, full_name: actor.account?.full_name }, body.phone_number);
    const updated = await jobs.update(jobId, patch);
    return Response.json({ ok: true, action, job: safeJobActionPayload(updated || { ...job, ...patch }) });
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'Could not update this gig.' }, { status: 500 });
  }
}