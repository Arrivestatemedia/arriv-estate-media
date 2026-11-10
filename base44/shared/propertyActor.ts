// Who is asking. Shared by the property surfaces that are read by the app's own people.
//
// Two identities exist in this app and both must work here:
//   * a customer, whose identity is the address the app already uses to own a job or a listing;
//   * an administrator, who signs in through the sales console and therefore lives in
//     SalesTeamMember rather than in the platform's user table.
//
// The resulting actor is only ever compared against a record's own client_email, or used to grant
// the administrator view. It is never used to decide that something belongs to somebody.

import { sanitizeText } from "./propertyVisibility.ts";

export interface PropertyActor {
  email: string;
  type: "customer" | "admin";
  isAdmin: boolean;
  clientEmail: string;
}

export async function resolvePropertyActor(base44: any, body: any): Promise<PropertyActor> {
  let platformEmail = "";
  let platformIsAdmin = false;
  try {
    const me = await base44.auth.me();
    if (me?.email) platformEmail = String(me.email);
    platformIsAdmin = me?.role === "admin";
  } catch {
    platformEmail = "";
  }

  const clientEmail = String(body?.clientEmail || body?.client_email || "").trim().toLowerCase();

  let staffAdmin: any = null;
  const claimedId = String(body?.sales_member_id || "").trim();
  const claimedEmail = String(body?.admin_email || body?.sales_member_email || "").trim();
  if (claimedId || claimedEmail) {
    try {
      const rows = claimedId
        ? await base44.asServiceRole.entities.SalesTeamMember.filter({ id: claimedId })
        : await base44.asServiceRole.entities.SalesTeamMember.filter({ email: claimedEmail });
      const member = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
      if (member && member.role === "admin" && member.is_active !== false) staffAdmin = member;
    } catch {
      staffAdmin = null;
    }
  }

  // A service-role session carries a synthetic platform identity; that alone is never treated as a
  // person administering the app.
  const isSystemSession = !platformEmail || /@no-reply\.base44\.com$/i.test(platformEmail);
  const isAdmin = (platformIsAdmin && !isSystemSession) || !!staffAdmin;

  if (isAdmin) {
    return {
      email: staffAdmin ? sanitizeText(staffAdmin.email, 160) : platformEmail,
      type: "admin",
      isAdmin: true,
      clientEmail,
    };
  }
  return { email: clientEmail, type: "customer", isAdmin: false, clientEmail };
}

// A lead, a page view and a page draft all belong to exactly one customer: the address recorded on
// the listing.
export function actorOwnsListing(listing: any, actor: PropertyActor): boolean {
  if (!listing) return false;
  if (actor.isAdmin) return true;
  const email = String(actor.clientEmail || "").toLowerCase();
  if (!email) return false;
  return String(listing.client_email || "").toLowerCase() === email;
}