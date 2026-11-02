import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { sendBrevoEmail, assertBrevoSendersActive } from "../../shared/brevoClient.ts";
import { reconcileEmailDeliveries } from "../../shared/queuedEmailDelivery.ts";
import { emailReceiptIds } from "../../shared/emailReceipts.ts";

const MAX_ATTEMPTS = 5;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(error => error.status === 401 ? null : Promise.reject(error));
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const nowIso = new Date().toISOString();
    const { reconcile_only = false } = await req.json().catch(() => ({}));
    const delivery = await reconcileEmailDeliveries(base44, "QueuedApplicationEmail", "last_error");
    if (reconcile_only) return Response.json({ success: delivery.lookup_errors === 0, provider: 'brevo', submitted: 0, ...delivery });
    const [due, retryable] = await Promise.all([
      base44.asServiceRole.entities.QueuedApplicationEmail.filter(
        { status: "pending", scheduled_for: { $lte: nowIso }, provider_message_id: { $in: [null, ""] }, $or: [{ attempts: { $lt: MAX_ATTEMPTS } }, { attempts: { $exists: false } }] },
        { sort: "scheduled_for", limit: 20 }
      ),
      base44.asServiceRole.entities.QueuedApplicationEmail.filter(
        { status: "failed", scheduled_for: { $lte: nowIso }, attempts: { $lt: MAX_ATTEMPTS }, provider_message_id: { $in: [null, ""] } },
        { sort: "scheduled_for", limit: 20 }
      ),
    ]);
    const records = [...due.items, ...retryable.items].slice(0, 20);
    if (records.length) await assertBrevoSendersActive(["careers@arrivestatemedia.com"]);
    let submittedCount = 0;
    let failedCount = 0;

    for (let offset = 0; offset < records.length; offset += 6) {
      await Promise.all(records.slice(offset, offset + 6).map(async rec => {
        const knownReceipts = emailReceiptIds(rec);
        if (knownReceipts.length) {
          await base44.asServiceRole.entities.QueuedApplicationEmail.update(rec.id, { status: 'submitted', provider_message_id: knownReceipts[0] });
          return;
        }
        const attempts = (rec.attempts || 0) + 1;
        let receipt;
        try {
          receipt = await sendBrevoEmail({ to: rec.recipient_email, subject: rec.subject, htmlContent: rec.html_content });
        } catch (error) {
          await base44.asServiceRole.entities.QueuedApplicationEmail.update(rec.id, {
            attempts, last_error: error.message, status: attempts >= (rec.max_attempts || MAX_ATTEMPTS) ? "failed" : "pending",
          });
          failedCount++;
          return;
        }
        await base44.asServiceRole.entities.QueuedApplicationEmail.update(rec.id, {
          status: "submitted", provider_message_id: receipt.messageId, provider_message_ids: emailReceiptIds(rec, receipt.messageId), submitted_at: new Date().toISOString(), attempts, last_error: "",
        });
        submittedCount++;
      }));
    }

    return Response.json({
      success: failedCount === 0,
      considered: records.length,
      submitted: submittedCount,
      sent: delivery.delivered,
      failed: failedCount + delivery.failed,
      awaiting_delivery_checked: delivery.checked,
      delivery_lookup_errors: delivery.lookup_errors,
      provider: 'brevo',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}