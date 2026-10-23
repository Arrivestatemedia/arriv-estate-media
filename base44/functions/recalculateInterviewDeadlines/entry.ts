import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { addBusinessHours } from "../../shared/businessHours.ts";
import { verifyAdmin } from "../../shared/adminAuth.ts";

/**
 * recalculateInterviewDeadlines
 *
 * One-time admin action: every async interview invitation that is still open
 * gets its deadline recalculated in BUSINESS hours (Mon–Fri, 9am–5pm ET) from
 * the moment it was sent.
 *
 * Invitations sent before business hours were introduced were counted in clock
 * hours, so a Friday afternoon invite ran out over the weekend. This re-dates
 * those live windows so no candidate loses time they were never able to use.
 *
 * Only ever moves a deadline LATER, and only for sessions still open
 * (INVITED / OPENED / FORMAT_SELECTED / STARTED / IN_PROGRESS / REOPENED) —
 * completed and expired sessions are left untouched. Safe to run more than
 * once: a window already counted in business hours is skipped.
 */

const ACTIVE_STATUSES = ["INVITED", "OPENED", "FORMAT_SELECTED", "STARTED", "IN_PROGRESS", "REOPENED"];
const DEFAULT_DEADLINE_HOURS = 48;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({} as any));

    const auth = await verifyAdmin(base44, body, url);
    if (!auth.authorized) {
      return Response.json({ error: auth.error || "Unauthorized — admin only" }, { status: 403 });
    }

    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { status: { $in: ACTIVE_STATUSES } },
      "-created_date",
      500
    );
    const sessions = (res?.data ?? res) || [];

    const updated: any[] = [];
    const skipped: any[] = [];

    for (const session of sessions) {
      if (!session.invited_at) {
        skipped.push({ id: session.id, reason: "no_invited_at" });
        continue;
      }

      const hours = Math.max(1, Number(session.deadline_hours) || DEFAULT_DEADLINE_HOURS);
      const corrected = addBusinessHours(new Date(session.invited_at), hours);
      const current = session.expires_at ? new Date(session.expires_at).getTime() : 0;

      if (current === corrected.getTime()) {
        skipped.push({ id: session.id, reason: "already_business_hours" });
        continue;
      }
      if (corrected.getTime() <= current) {
        skipped.push({ id: session.id, reason: "not_later" });
        continue;
      }

      try {
        await base44.asServiceRole.entities.InterviewSession.update(session.id, {
          expires_at: corrected.toISOString(),
        });
        updated.push({
          id: session.id,
          candidate: session.candidate_name,
          hours,
          from: session.expires_at,
          to: corrected.toISOString(),
        });
      } catch (e) {
        skipped.push({ id: session.id, reason: `update_failed: ${e.message}` });
      }
    }

    console.log(
      `recalculateInterviewDeadlines: scanned ${sessions.length}, updated ${updated.length}, skipped ${skipped.length} (actor ${auth.actorEmail})`
    );

    return Response.json({
      status: "success",
      scanned: sessions.length,
      updated: updated.length,
      skipped: skipped.length,
      updated_sessions: updated,
      skipped_details: skipped,
    });
  } catch (error) {
    console.error("recalculateInterviewDeadlines error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}