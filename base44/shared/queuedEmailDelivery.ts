import { getBrevoDelivery } from "./brevoClient.ts";

export async function reconcileEmailDeliveries(base44, entityName, errorField) {
  const page = await base44.asServiceRole.entities[entityName].filter(
    { status: "submitted", provider_message_id: { $exists: true } },
    { sort: "submitted_at", limit: 20 }
  );
  let delivered = 0;
  let failed = 0;
  for (let offset = 0; offset < page.items.length; offset += 6) {
    await Promise.all(page.items.slice(offset, offset + 6).map(async record => {
      const result = await getBrevoDelivery(record.provider_message_id);
      if (!result) return;
      await base44.asServiceRole.entities[entityName].update(record.id, {
        status: result.status,
        ...(result.delivered_at ? { sent_at: result.delivered_at, [errorField]: "" } : { [errorField]: result.error }),
      });
      if (result.status === "sent") delivered++;
      else failed++;
    }));
  }
  return { checked: page.items.length, delivered, failed };
}