import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { checkEligibility, loadApplicationForConference, parseScheduledDateTime } from "../../shared/asyncInterviewMigration.ts";

/**
 * listEligibleScheduledInterviews
 *
 * Lists all scheduled conferences, enriched with candidate info and
 * eligibility status for the async interview migration. Used by the
 * admin migration UI to show which interviews can be converted.
 *
 * Body:
 *   includeIneligible — default false. When true, also returns ineligible
 *                       conferences with their exclusion reason.
 *
 * Returns { eligible: [...], ineligible: [...], summary: {...} }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const includeIneligible = body?.includeIneligible ?? false;

    const res = await base44.asServiceRole.entities.Conference.filter(
      { status: "scheduled" }, "-scheduled_date", 500
    );
    const conferences = (res?.data ?? res) || [];
    const now = new Date();

    const eligible = [];
    const ineligible = [];

    for (const conf of conferences) {
      const app = await loadApplicationForConference(base44, conf);
      const eligibility = checkEligibility(conf, app, now);
      const scheduledDt = parseScheduledDateTime(conf.scheduled_date, conf.scheduled_time);

      const item = {
        conferenceId: conf.id,
        title: conf.title,
        candidateName: app?.full_name || conf.participants?.[0]?.name || "Unknown",
        candidateEmail: app?.email || conf.participants?.[0]?.email || "",
        scheduledDate: conf.scheduled_date,
        scheduledTime: conf.scheduled_time,
        scheduledAt: scheduledDt?.toISOString() || null,
        interviewMode: conf.interview_mode || "human",
        round: conf.round ?? 1,
        appStatus: app?.status || null,
        applicationId: app?.id || conf.application_id || null,
        alreadyConverted: !!eligibility.alreadyConverted,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        hasCalendarEvent: !!conf.google_calendar_event_id,
        reminderSuppressed: conf.reminder_suppressed,
      };

      if (eligibility.eligible) {
        eligible.push(item);
      } else if (includeIneligible || eligibility.alreadyConverted) {
        ineligible.push(item);
      }
    }

    return Response.json({
      eligible,
      ineligible: includeIneligible ? ineligible : [],
      summary: {
        totalScheduled: conferences.length,
        eligibleCount: eligible.length,
        ineligibleCount: ineligible.length,
        alreadyConvertedCount: ineligible.filter(i => i.alreadyConverted).length,
      },
    });
  } catch (error) {
    console.error("listEligibleScheduledInterviews error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});