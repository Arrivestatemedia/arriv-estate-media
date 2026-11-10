import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { actorOwnsListing, resolvePropertyActor } from "../../shared/propertyActor.ts";
import { deliverPropertyInquiry } from "../../shared/propertyLeadDelivery.ts";
import { sanitizeText } from "../../shared/propertyVisibility.ts";
import { requireCustomer } from "../../shared/customerSession.ts";
import { customerEmailQuery } from '../../shared/customerEmail.ts';

// The customer-facing lead dashboard feed.
//
// Access is decided here, server-side, from the listing's own client_email: a customer sees the
// leads for their own property pages and nothing else, and an administrator sees every listing.
// The PropertyInquiry entity itself stays closed to everything except the service role, so a lead
// can never be read by addressing the database directly.

const LEAD_PAGE = 200;
const TRAFFIC_PAGE = 500;
const DAY_WINDOW = 30;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function leadStatus(inquiry: any) {
  const notification = String(inquiry?.notification_status || "");
  if (notification === "failed") return "failed";
  if (notification === "delivered") return "delivered";
  if (notification === "retrying" || notification === "pending_agent_delivery") return "pending";
  return "recorded";
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "summary");
    const actor = await resolvePropertyActor(base44, body);

    // A customer's identity comes from the signed session, never from the body. Administrators keep
    // the existing verified sales-console identity.
    if (!actor.isAdmin) {
      const auth = await requireCustomer(base44, req, body);
      if (!auth.ok) {
        return Response.json({ ok: false, reason: "SESSION_REQUIRED", message: auth.error }, { status: auth.status });
      }
      actor.clientEmail = auth.actor.email;
      actor.email = auth.actor.email;
    }

    const listingsEntity = base44.asServiceRole.entities.PropertyListing;
    const inquiriesEntity = base44.asServiceRole.entities.PropertyInquiry;

    const owned = (actor.isAdmin
      ? rows(await listingsEntity.filter({}, { sort: "-updated_at", limit: 100 }))
      : rows(await listingsEntity.filter(customerEmailQuery('client_email', actor.clientEmail), { sort: "-updated_at", limit: 100 }))
    ).filter((listing: any) => listing?.certification_mode !== true && listing?.listing_id);

    const ids = owned.map((listing: any) => listing.listing_id);

    if (action === "update_inquiry" || action === "resend_delivery") {
      const inquiryId = sanitizeText(body.inquiryId, 120);
      if (!inquiryId) return Response.json({ ok: false, reason: "INQUIRY_REQUIRED" }, { status: 400 });
      const inquiry = rows(await inquiriesEntity.filter({ inquiry_id: inquiryId }))[0] || null;
      if (!inquiry) return Response.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
      const listing = owned.find((item: any) => item.listing_id === inquiry.listing_id) || null;
      if (!listing || !actorOwnsListing(listing, actor)) {
        return Response.json({ ok: false, reason: "FORBIDDEN", message: "This inquiry is not on one of your properties." }, { status: 403 });
      }

      if (action === "update_inquiry") {
        const next = String(body.status || "");
        if (!["closed", "routed"].includes(next)) {
          return Response.json({ ok: false, reason: "INVALID_STATUS" }, { status: 400 });
        }
        const patch: Record<string, any> = { status: next };
        if (next === "closed") {
          patch.closed_at = new Date().toISOString();
          patch.closed_by = actor.email;
        } else {
          patch.closed_at = null;
          patch.closed_by = "";
        }
        await inquiriesEntity.update(inquiry.id, patch);
        return Response.json({ ok: true, status: next });
      }

      // Resending is an explicit, owner-initiated retry: it is the recovery path when a provider
      // outage outlasted the automatic schedule.
      const outcome = await deliverPropertyInquiry(base44, inquiry, { force: true });
      return Response.json({ ok: outcome.ok === true, delivery: outcome });
    }

    if (!ids.length) {
      return Response.json({
        ok: true,
        is_admin: actor.isAdmin,
        listings: [],
        inquiries: [],
        totals: { leads_total: 0, leads_open: 0, leads_failed: 0, leads_pending: 0, views_30d: 0 },
      });
    }

    const [inquiryRows, trafficRows] = await Promise.all([
      inquiriesEntity.filter({ listing_id: { $in: ids } }, { sort: "-created_at", limit: LEAD_PAGE }).then(rows).catch(() => []),
      base44.asServiceRole.entities.PropertyTrafficDaily
        .filter({ listing_id: { $in: ids } }, { sort: "-day", limit: TRAFFIC_PAGE })
        .then(rows)
        .catch(() => []),
    ]);

    const since = daysAgo(DAY_WINDOW);
    const viewsByListing = new Map<string, number>();
    for (const bucket of trafficRows) {
      if (String(bucket?.day || "") < since) continue;
      viewsByListing.set(bucket.listing_id, (viewsByListing.get(bucket.listing_id) || 0) + Number(bucket.views || 0));
    }

    const summary = owned.map((listing: any) => {
      const mine = inquiryRows.filter((inquiry: any) => inquiry.listing_id === listing.listing_id);
      return {
        listing_id: listing.listing_id,
        job_id: listing.job_id || "",
        public_slug: listing.public_slug,
        property_address: listing.property_address,
        city: listing.city,
        state: listing.state,
        listing_status: listing.listing_status,
        publication_state: listing.publication_state,
        public_url: listing.canonical_url || listing.public_url || "",
        status_confirmation_due_at: listing.status_confirmation_due_at || "",
        leads_total: mine.length,
        leads_open: mine.filter((inquiry: any) => inquiry.status !== "closed").length,
        leads_failed: mine.filter((inquiry: any) => inquiry.notification_status === "failed").length,
        leads_pending: mine.filter((inquiry: any) => ["pending_agent_delivery", "retrying"].includes(String(inquiry.notification_status))).length,
        views_30d: viewsByListing.get(listing.listing_id) || 0,
        last_inquiry_at: mine[0]?.created_at || "",
      };
    });

    const leads = inquiryRows.map((inquiry: any) => ({
      inquiry_id: inquiry.inquiry_id,
      listing_id: inquiry.listing_id,
      public_slug: inquiry.public_slug,
      property_reference: inquiry.property_reference,
      name: inquiry.name,
      email: inquiry.email,
      phone: inquiry.phone,
      message: inquiry.message,
      status: inquiry.status,
      lead_status: leadStatus(inquiry),
      notification_status: inquiry.notification_status,
      delivery_attempts: inquiry.delivery_attempts || 0,
      delivery_error: inquiry.delivery_error || "",
      delivered_at: inquiry.delivered_at || "",
      channel: inquiry.channel || "direct",
      utm_source: inquiry.utm_source || "",
      utm_campaign: inquiry.utm_campaign || "",
      referrer_host: inquiry.referrer_host || "",
      spam_score: inquiry.spam_score || 0,
      created_at: inquiry.created_at,
      closed_at: inquiry.closed_at || "",
    }));

    const totals = summary.reduce(
      (acc: any, item: any) => ({
        leads_total: acc.leads_total + item.leads_total,
        leads_open: acc.leads_open + item.leads_open,
        leads_failed: acc.leads_failed + item.leads_failed,
        leads_pending: acc.leads_pending + item.leads_pending,
        views_30d: acc.views_30d + item.views_30d,
      }),
      { leads_total: 0, leads_open: 0, leads_failed: 0, leads_pending: 0, views_30d: 0 },
    );

    return Response.json({ ok: true, is_admin: actor.isAdmin, listings: summary, inquiries: leads, totals });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}