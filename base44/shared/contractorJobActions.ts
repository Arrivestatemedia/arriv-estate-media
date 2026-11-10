/**
 * Contractor write actions on Job.
 *
 * Job creates/updates/deletes are administrator-only, so the two contractor
 * actions that used to be direct entity writes now go through one endpoint that
 * enforces both assignment and state server-side:
 *
 *   book_backup  -> offer to back up a booking-sourced gig that is still open/booked
 *   on_my_way    -> the assigned partner (primary or backup) starts travelling
 *
 * Nothing here trusts the browser: the acting email always comes from the signed
 * customer session, and only these named fields are ever written.
 */

export type ContractorActionKind = 'book_backup' | 'on_my_way';

/** A backup can only be offered on a gig that has not been worked yet. */
export const BACKUP_BOOKABLE_STATUSES = ['open', 'booked'];

/** Travelling only makes sense once the gig is assigned but not yet captured. */
export const ON_MY_WAY_JOB_STATUSES = ['booked', 'in_progress'];

/** Partner states from which heading out is still a forward move. */
export const ON_MY_WAY_PARTNER_STATUSES = ['awaiting_arrival'];

/** Partners who are allowed to act on this gig at all. */
export function assignedContractorEmails(job: any): string[] {
  const emails = [job?.booked_by, job?.backup_booked_by]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(emails)];
}

export function isAssignedContractor(job: any, email: string): boolean {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;
  return assignedContractorEmails(job).includes(target);
}

export type ActionDecision = { allowed: true } | { allowed: false; reason: string; status: number };

function deny(reason: string, status = 409): ActionDecision {
  return { allowed: false, reason, status };
}

/**
 * Decide whether this contractor may perform this action on this job. Every
 * branch is explicit so an unexpected job state fails closed instead of writing.
 */
export function evaluateContractorAction(job: any, contractorEmail: string, action: string): ActionDecision {
  if (!job || !job.id) return deny('That gig could not be found.', 404);

  const jobStatus = String(job.status || '');

  if (action === 'book_backup') {
    if (job.from_booking !== true) {
      return deny('This gig is not accepting backup partners.', 409);
    }
    if (!BACKUP_BOOKABLE_STATUSES.includes(jobStatus)) {
      return deny(`This gig is no longer taking backup partners (it is ${jobStatus || 'closed'}).`, 409);
    }
    const me = String(contractorEmail || '').trim().toLowerCase();
    if (assignedContractorEmails(job).includes(me)) {
      return deny('You are already on this gig.', 409);
    }
    return { allowed: true };
  }

  if (action === 'on_my_way') {
    if (!isAssignedContractor(job, contractorEmail)) {
      return deny('You are not assigned to this gig.', 403);
    }
    const partnerStatus = String(job.media_partner_status || '');

    // Re-tapping after the update already landed is harmless: report success so
    // a slow connection cannot leave the partner stuck on a failed button.
    if (partnerStatus === 'on_the_way') return { allowed: true };

    if (!ON_MY_WAY_PARTNER_STATUSES.includes(partnerStatus)) {
      return deny(`Your status on this gig is already "${partnerStatus || 'set'}".`, 409);
    }
    if (!ON_MY_WAY_JOB_STATUSES.includes(jobStatus)) {
      return deny(`This gig is ${jobStatus || 'not ready'} and cannot be started.`, 409);
    }
    return { allowed: true };
  }

  return deny('Unknown action.', 400);
}

/** The only Job fields this endpoint may write, derived server-side. */
export function actionPatch(action: ContractorActionKind, contractor: { email: string; full_name?: string }, phone?: string) {
  if (action === 'book_backup') {
    return {
      backup_booked_by: contractor.email,
      backup_booked_by_name: contractor.full_name || '',
      backup_booked_by_phone: String(phone || '').trim(),
    };
  }
  return {
    media_partner_status: 'on_the_way',
    on_the_way_at: new Date().toISOString(),
  };
}

/** Job fields the contractor may receive back. No pay, PII or admin pricing. */
export function safeJobActionPayload(job: any) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status || '',
    media_partner_status: job.media_partner_status || '',
    on_the_way_at: job.on_the_way_at || '',
    backup_booked_by: job.backup_booked_by || '',
    backup_booked_by_name: job.backup_booked_by_name || '',
    backup_booked_by_phone: job.backup_booked_by_phone || '',
  };
}