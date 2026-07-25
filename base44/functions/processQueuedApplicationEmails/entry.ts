import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from "../../shared/brevoClient.ts";

const MAX_ATTEMPTS = 5;
const SEND_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

async function trySendWithRetry({ to, subject, htmlContent }) {
  let lastErr;
  for (let attempt = 1; attempt <= SEND_RETRIES; attempt++) {
    try {
      await sendBrevoEmail({ to, subject, htmlContent });
      return { ok: true };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  return { ok: false, error: lastErr?.message || "unknown error" };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const nowIso = new Date().toISOString();

    // Due pending emails (scheduled for now or earlier)
    const due = await base44.asServiceRole.entities.QueuedApplicationEmail.filter(
      { status: "pending", scheduled_for: { $lte: nowIso } },
      "-scheduled_for",
      100
    );

    // Previously failed emails that haven't exhausted their attempts yet
    let retryable = [];
    try {
      retryable = await base44.asServiceRole.entities.QueuedApplicationEmail.filter(
        { status: "failed", attempts: { $lt: MAX_ATTEMPTS } },
        "-scheduled_for",
        100
      );
    } catch (e) {
      // Non-fatal — proceed with due emails only
    }

    const records = [...due, ...retryable];
    let sentCount = 0;
    let failedCount = 0;

    for (const rec of records) {
      const result = await trySendWithRetry({
        to: rec.recipient_email,
        subject: rec.subject,
        htmlContent: rec.html_content,
      });

      if (result.ok) {
        await base44.asServiceRole.entities.QueuedApplicationEmail.update(rec.id, {
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        sentCount++;
      } else {
        const attempts = (rec.attempts || 0) + 1;
        await base44.asServiceRole.entities.QueuedApplicationEmail.update(rec.id, {
          attempts,
          last_error: result.error,
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        });
        failedCount++;
      }
    }

    return Response.json({
      success: true,
      considered: records.length,
      sent: sentCount,
      failed: failedCount,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});