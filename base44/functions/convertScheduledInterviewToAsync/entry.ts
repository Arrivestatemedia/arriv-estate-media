import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { convertConferenceToAsync } from "../../shared/asyncInterviewMigration.ts";

/**
 * convertScheduledInterviewToAsync
 *
 * Converts a single scheduled first-round interview to the asynchronous
 * candidate-choice format.
 *
 * Body:
 *   conferenceId  — required, the Conference ID to convert
 *   adminName     — name/id of the admin authorizing
 *   sendEmail     — default false. When true, sends the "Update to Your
 *                   Interview" conversion email to the candidate.
 *   dryRun        — default false. When true, only validates eligibility
 *                   without making any changes.
 *
 * SAFETY: sendEmail defaults to FALSE. No real emails are sent unless the
 * caller explicitly passes sendEmail=true. This protects against accidental
 * candidate communication during implementation/testing.
 *
 * The function is IDEMPOTENT: calling it twice on the same conference will
 * not create duplicate sessions, deadlines, or emails.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { conferenceId, adminName, sendEmail = false, dryRun = false } = body;

    if (!conferenceId) {
      return Response.json({ error: "conferenceId is required" }, { status: 400 });
    }

    const result = await convertConferenceToAsync(base44, {
      conferenceId,
      adminName: adminName || "admin",
      sendEmail,
      dryRun,
    });

    return Response.json(result);
  } catch (error) {
    console.error("convertScheduledInterviewToAsync error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});