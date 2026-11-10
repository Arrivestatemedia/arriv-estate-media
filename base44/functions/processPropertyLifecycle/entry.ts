import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  needsStatusConfirmation,
  nextConfirmationDue,
  sanitizeText,
  shouldAutoDeactivate,
} from "../../shared/propertyVisibility.ts";
import { buildAutoDeactivatedEmail, buildStatusConfirmationEmail } from "../../shared/propertyLifecycleNotices.ts";
import { BOOKINGS_SENDER_EMAIL, sendBrevoEmail } from "../../shared/brevoClient.ts";
import { purgeListingFromEdge } from "../../shared/edgeCache.ts";

// The listing lifecycle, run by a daily workflow.
//
// Two rules were already written into the engine and are only now given a clock:
//
//   30 days without a status confirmation — the page stops appearing in the directory and search
//   results (enforced at read time already) and the owner is asked to confirm.
//
//   60 days without a confirmation — the page is unpublished. Nothing the customer approved is
//   deleted: the details, photography and video stay exactly as they are, and confirming the status
//   and publishing again restores the same page at the same address.
//
// Nothing here can publish, approve or restore anything. It only ever moves a stale page out of the
// public view, records why, and tells the owner.

const BATCH = 200;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  // A dry run reports exactly what it would do and writes nothing, which is how this is verified
  // before the schedule is trusted with it.
  const dryRun = body?.dry_run === true;

  try {
    const listingsEntity = base44.asServiceRole.entities.PropertyListing;
    const events = base44.asServiceRole.entities.PropertyListingEvent;

    const published = rows(await listingsEntity.filter({ publication_state: "PUBLISHED" }, { limit: BATCH }))
      .filter((listing: any) => listing?.certification_mode !== true);

    const now = new Date();
    const nowIso = now.toISOString();
    const plan: any[] = [];
    let deactivated = 0;
    let reminded = 0;

    for (const listing of published) {
      if (shouldAutoDeactivate(listing, now)) {
        plan.push({ listing_id: listing.listing_id, action: "deactivate", reference: listing.last_status_confirmed_at || listing.published_at });
        if (dryRun) continue;

        const history = [
          ...(listing.publication_history || []),
          {
            from_state: "PUBLISHED",
            to_state: "UNPUBLISHED",
            at: nowIso,
            actor: "system:listing_lifecycle",
            note: "Auto-unpublished: listing status was not confirmed for 60 days.",
          },
        ];
        const patch: Record<string, any> = {
          publication_state: "UNPUBLISHED",
          unpublished_at: nowIso,
          publication_history: history,
          sitemap_included: false,
          updated_at: nowIso,
        };
        await listingsEntity.update(listing.id, patch);

        await events.create({
          event_id: `plev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          listing_id: listing.listing_id,
          event_type: "auto_deactivated_stale_status",
          actor: "system:listing_lifecycle",
          actor_type: "system",
          previous_state: "PUBLISHED",
          new_state: "UNPUBLISHED",
          details: {
            last_status_confirmed_at: listing.last_status_confirmed_at || null,
            published_at: listing.published_at || null,
            reason: "status_not_confirmed_within_60_days",
          },
          recorded_at: nowIso,
          certification_mode: false,
        });

        await purgeListingFromEdge({ ...listing, ...patch }).catch(() => null);

        const to = sanitizeText(listing.client_email, 160);
        if (to) {
          try {
            const notice = buildAutoDeactivatedEmail(listing);
            await sendBrevoEmail({
              to,
              subject: notice.subject,
              htmlContent: notice.html,
              senderEmail: BOOKINGS_SENDER_EMAIL,
            });
          } catch (error: any) {
            console.log(`auto-deactivation notice failed for ${listing.listing_id}: ${error?.message || error}`);
          }
        }
        deactivated += 1;
        continue;
      }

      if (!needsStatusConfirmation(listing, now)) continue;

      // One reminder per confirmation period, decided from the audit trail rather than a flag on the
      // listing, so the reminder can never be sent twice for the same due date.
      const reference = listing.last_status_confirmed_at || listing.published_at || "";
      const prior = rows(
        await events.filter(
          { listing_id: listing.listing_id, event_type: "status_confirmation_due" },
          { sort: "-recorded_at", limit: 1 },
        ),
      )[0];
      if (prior && String(prior.recorded_at || "") >= String(reference)) continue;

      plan.push({ listing_id: listing.listing_id, action: "confirm_request", reference });
      if (dryRun) continue;

      const to = sanitizeText(listing.client_email, 160);
      if (!to) continue;
      try {
        const notice = buildStatusConfirmationEmail(listing);
        await sendBrevoEmail({
          to,
          subject: notice.subject,
          htmlContent: notice.html,
          senderEmail: BOOKINGS_SENDER_EMAIL,
        });
        await events.create({
          event_id: `plev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          listing_id: listing.listing_id,
          event_type: "status_confirmation_due",
          actor: "system:listing_lifecycle",
          actor_type: "system",
          previous_state: listing.publication_state,
          new_state: listing.publication_state,
          details: { reference, due_at: nextConfirmationDue(new Date(reference || nowIso)) },
          recorded_at: new Date().toISOString(),
          certification_mode: false,
        });
        reminded += 1;
      } catch (error: any) {
        console.log(`confirmation request failed for ${listing.listing_id}: ${error?.message || error}`);
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      inspected: published.length,
      deactivated,
      reminded,
      plan,
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
});