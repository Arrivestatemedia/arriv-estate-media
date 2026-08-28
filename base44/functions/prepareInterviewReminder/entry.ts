import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { etWallToUtc } from "../../shared/businessEmailQueue.ts";

/**
 * prepareInterviewReminder
 *
 * Called at the start of the per-interview reminder workflow (fired when an
 * interview is scheduled or rescheduled). Computes the UTC datetime 30 minutes
 * before the interview start so the workflow can wait until then, and resets
 * the reminder flag so a rescheduled interview gets a fresh reminder.
 *
 * Invoked by a workflow (no user token) — uses the service role.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const conferenceId = body.conference_id;
    if (!conferenceId) return Response.json({ valid: false, error: "conference_id required" }, { status: 400 });

    const conf = await base44.asServiceRole.entities.Conference.get(conferenceId);
    if (!conf) return Response.json({ valid: false, reason: "not_found" });
    if (conf.status !== "scheduled") return Response.json({ valid: false, reason: "not_scheduled" });
    if (!conf.meeting_link) return Response.json({ valid: false, reason: "no_meeting_link" });
    if (!conf.scheduled_date || !conf.scheduled_time) return Response.json({ valid: false, reason: "no_scheduled_time" });

    const [y, m, d] = conf.scheduled_date.split("-").map(Number);
    const [h, mi] = conf.scheduled_time.split(":").map(Number);
    const startUtc = etWallToUtc(y, m, d, h, mi);
    const now = new Date();
    if (startUtc.getTime() <= now.getTime()) return Response.json({ valid: false, reason: "already_started" });

    const targetUtc = new Date(startUtc.getTime() - 30 * 60 * 1000);

    // Reset the flag on reschedule so the new time gets a fresh reminder.
    if (conf.reminder_30min_sent) {
      try {
        await base44.asServiceRole.entities.Conference.update(conferenceId, {
          reminder_30min_sent: false,
          reminder_30min_sent_at: null,
        });
      } catch (e) {
        console.warn(`prepare: reset flag failed for ${conferenceId}: ${e.message}`);
      }
    }

    return Response.json({
      valid: true,
      conference_id: conferenceId,
      target_iso: targetUtc.toISOString(),
      start_iso: startUtc.toISOString(),
    });
  } catch (error) {
    console.error("prepareInterviewReminder error:", error.message);
    return Response.json({ valid: false, error: error.message }, { status: 500 });
  }
}