import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

/**
 * processAsyncInterviewReminders
 *
 * Scans all active InterviewSessions and sends the appropriate async reminder:
 *   - 24h reminder:  when <=24h remain before expires_at (and >4h remain)
 *   - 4h reminder:   when <=4h remain before expires_at (and >0 remain)
 *   - Started-incomplete: when status is STARTED/IN_PROGRESS and >=12h since started_at
 *
 * Also expires sessions whose deadline has passed.
 *
 * Invoked by a scheduled workflow (no user token) — uses the service role.
 * Returns counts of each reminder type sent and sessions expired.
 */

const ACTIVE_STATUSES = ["INVITED", "OPENED", "FORMAT_SELECTED", "STARTED", "IN_PROGRESS", "REOPENED"];
const STARTED_STATUSES = ["STARTED", "IN_PROGRESS"];
const REMINDER_24H_MS = 24 * 3600 * 1000;
const REMINDER_4H_MS = 4 * 3600 * 1000;
const STARTED_INCOMPLETE_MS = 12 * 3600 * 1000;

function buildReminderHtml(firstName: string, hoursRemaining: number, deadlineDisplay: string, interviewUrl: string): string {
  const hourLabel = hoursRemaining <= 4 ? "4 hours" : "24 hours";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This is a friendly reminder that your first-round interview with Arriv Estate Media closes in approximately <strong>${hourLabel}</strong>.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please complete your interview before the deadline below. The interview takes approximately 15 minutes and can be completed at your convenience.</p>
          <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1A1A1A;">Deadline:</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#B8956A;font-weight:600;">${deadlineDisplay}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${interviewUrl}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">COMPLETE MY INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:rgba(26,26,26,0.7);">If you've already completed your interview, you can disregard this message.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function buildStartedIncompleteHtml(firstName: string, deadlineDisplay: string, interviewUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We noticed you started your first-round interview but haven't completed it yet. No worries — you can pick up right where you left off.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your progress is saved, so simply use the link below to resume and finish your remaining questions.</p>
          <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1A1A1A;">Deadline:</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#B8956A;font-weight:600;">${deadlineDisplay}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${interviewUrl}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">RESUME MY INTERVIEW</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function formatDeadline(expiresAtIso: string): string {
  return new Date(expiresAtIso).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    timeZone: "America/New_York",
  });
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const domain = Deno.env.get("BASE44_APP_DOMAIN") || "https://arrivestatemedia.base44.app";
    const now = Date.now();

    const counts = { reminder_24h: 0, reminder_4h: 0, started_incomplete: 0, expired: 0, skipped: 0 };

    // Fetch all active sessions (up to 200 per batch)
    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { status: { $in: ACTIVE_STATUSES } },
      "-created_date",
      200
    );
    const sessions = (res?.data ?? res) || [];

    for (const session of sessions) {
      try {
        const expiresAt = session.expires_at ? new Date(session.expires_at).getTime() : 0;
        const msRemaining = expiresAt - now;
        const interviewUrl = `${domain}/AsyncInterview?token=${session.session_token}`;
        const firstName = (session.candidate_name || "").split(" ")[0] || "there";
        const deadlineDisplay = formatDeadline(session.expires_at);

        // ── Expire past-deadline sessions ──
        if (msRemaining <= 0) {
          await base44.asServiceRole.entities.InterviewSession.update(session.id, { status: "EXPIRED" });
          counts.expired++;
          continue;
        }

        // ── 24h reminder ──
        if (!session.reminder_24h_sent && msRemaining <= REMINDER_24H_MS && msRemaining > REMINDER_4H_MS) {
          try {
            await base44.integrations.Core.SendEmail({
              to: session.candidate_email,
              subject: `Reminder: Your Arriv Estate Media Interview Closes in 24 Hours`,
              body: buildReminderHtml(firstName, 24, deadlineDisplay, interviewUrl),
            });
            await base44.asServiceRole.entities.InterviewSession.update(session.id, { reminder_24h_sent: true });
            counts.reminder_24h++;
          } catch (e) {
            console.warn(`24h reminder failed for ${session.id}: ${e.message}`);
          }
          continue;
        }

        // ── 4h reminder ──
        if (!session.reminder_4h_sent && msRemaining <= REMINDER_4H_MS && msRemaining > 0) {
          try {
            await base44.integrations.Core.SendEmail({
              to: session.candidate_email,
              subject: `Reminder: Your Arriv Estate Media Interview Closes in 4 Hours`,
              body: buildReminderHtml(firstName, 4, deadlineDisplay, interviewUrl),
            });
            await base44.asServiceRole.entities.InterviewSession.update(session.id, { reminder_4h_sent: true });
            counts.reminder_4h++;
          } catch (e) {
            console.warn(`4h reminder failed for ${session.id}: ${e.message}`);
          }
          continue;
        }

        // ── Started-incomplete reminder ──
        if (!session.reminder_started_sent && STARTED_STATUSES.includes(session.status) && session.started_at) {
          const startedAge = now - new Date(session.started_at).getTime();
          if (startedAge >= STARTED_INCOMPLETE_MS) {
            try {
              await base44.integrations.Core.SendEmail({
                to: session.candidate_email,
                subject: `Don't Forget to Finish Your Arriv Estate Media Interview`,
                body: buildStartedIncompleteHtml(firstName, deadlineDisplay, interviewUrl),
              });
              await base44.asServiceRole.entities.InterviewSession.update(session.id, { reminder_started_sent: true });
              counts.started_incomplete++;
            } catch (e) {
              console.warn(`started-incomplete reminder failed for ${session.id}: ${e.message}`);
            }
            continue;
          }
        }

        counts.skipped++;
      } catch (e) {
        console.warn(`processAsyncInterviewReminders: session ${session.id} error: ${e.message}`);
        counts.skipped++;
      }
    }

    return Response.json({ status: "success", ...counts, total_scanned: sessions.length });
  } catch (error) {
    console.error("processAsyncInterviewReminders error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}