import { getBrevoDelivery } from "./brevoClient.ts";
import { emailReceiptIds } from "./emailReceipts.ts";

export async function reconcileEmailDeliveries(base44, entityName, errorField) {
  const page = await base44.asServiceRole.entities[entityName].filter(
    { status: "submitted", provider_message_id: { $exists: true } },
    { sort: "submitted_at", limit: 20 }
  );
  let delivered = 0;
  let failed = 0;
  let lookupErrors = 0;
  for (let offset = 0; offset < page.items.length; offset += 6) {
    const outcomes = await Promise.allSettled(page.items.slice(offset, offset + 6).map(async record => {
      let confirmed = null;
      let rejection = null;
      let unresolved = false;
      for (const messageId of emailReceiptIds(record)) {
        const result = await getBrevoDelivery(messageId);
        if (result?.status === 'sent') { confirmed = result; break; }
        if (result?.status === 'failed') rejection = result;
        else unresolved = true;
      }
      const result = confirmed || (!unresolved ? rejection : null);
      if (!result) return;
      await base44.asServiceRole.entities[entityName].update(record.id, {
        status: result.status,
        provider_message_ids: emailReceiptIds(record),
        ...(confirmed
          ? { sent_at: confirmed.delivered_at, delivery_message_id: confirmed.message_id, [errorField]: '' }
          : { [errorField]: result.error }),
      });
      if (confirmed) delivered++;
      else failed++;
    }));
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        lookupErrors++;
        console.error('Brevo delivery check failed; email remains submitted:', outcome.reason?.message);
      }
    }
  }
  // Delayed statistics or a failed lookup must not stop other due emails from sending.
  return { checked: page.items.length, delivered, failed, lookup_errors: lookupErrors };
}