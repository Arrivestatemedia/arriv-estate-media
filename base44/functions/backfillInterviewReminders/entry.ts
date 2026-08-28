import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { etWallToUtc } from "../../shared/businessEmailQueue.ts";

/**
 * backfillInterviewReminders
 *
 * One-time admin action: for every scheduled interview that hasn't started yet,
 * stamps a unique `reminder_schedule_token` on the Conference record. That
 * update fires the entity-triggered reminder workflow for each one, so the
 * 30-minute reminder gets pre-scheduled exactly as it would be for a newly
 * scheduled interview.
 *
 * Safe to run more than once — already-reminded interviews are skipped by the
 * workflow's sendInterviewReminder guard.
 *
 * Invoked by an admin (expects an authenticated admin user).
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const now = new Date();
    const res = await base44.asServiceRole.entities.Conference.filter(
      { status: "scheduled" },
      "-scheduled_date",
      500
    );
    const conferences = res?.data ?? res ?? [];

    const tokenized: any[] = [];
    const skipped: any[] = [];
    for (const conf of conferences) {
      if (!conf.scheduled_date || !conf.scheduled_time || !conf.meeting_link) {
        skipped.push({ id: conf.id, reason: "missing_data" });
        continue;
      }
      const [y, m, d] = conf.scheduled_date.split("-").map(Number);
      const [h, mi] = conf.scheduled_time.split(":").map(Number);
      const startUtc = etWallToUtc(y, m, d, h, mi);
      if (startUtc.getTime() <= now.getTime()) {
        skipped.push({ id: conf.id, reason: "already_started" });
        continue;
      }
      const token = `backfill-${now.toISOString()}-${conf.id}`;
      try {
        await base44.asServiceRole.entities.Conference.update(conf.id, { reminder_schedule_token: token });
        tokenized.push({ id: conf.id, start: startUtc.toISOString() });
      } catch (e) {
        skipped.push({ id: conf.id, reason: `token_failed: ${e.message}` });
      }
    }

    return Response.json({
      status: "success",
      tokenized: tokenized.length,
      skipped: skipped.length,
      tokenized_ids: tokenized,
      skipped_details: skipped,
    });
  } catch (error) {
    console.error("backfillInterviewReminders error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}