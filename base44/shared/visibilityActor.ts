// Who is asking, for the Phase 4 visibility surfaces.
//
// Two identities exist in this app and both must work here: a customer, identified by the address the
// app already uses to own a job, a listing or a profile; and an administrator, who signs in through the
// sales console and therefore lives in SalesTeamMember. The result is only ever compared against a
// record's own owner/team addresses, or used to grant the administrator view — never to decide that
// something belongs to somebody.

import { requireCustomer } from "./customerSession.ts";

export interface VisibilityActor {
  email: string;
  isAdmin: boolean;
}

export function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : result?.items || [];
}

export async function resolveVisibilityActor(base44: any, body: any): Promise<VisibilityActor> {
  if (body?.session_token) {
    const auth = await requireCustomer(base44, null as any, body);
    return { email: auth.ok ? auth.actor.email : '', isAdmin: false };
  }
  let me: any = null;
  try {
    me = await base44.auth.me();
  } catch {
    me = null;
  }

  const platformEmail = String(me?.email || "");
  const isSystemSession = !platformEmail || /@no-reply\.base44\.com$/i.test(platformEmail);
  let isAdmin = me?.role === "admin" && !isSystemSession;

  if (!isAdmin) {
    const staffId = String(body?.sales_member_id || "").trim();
    const staffEmail = String(body?.admin_email || body?.sales_member_email || "").trim();
    if (staffId || staffEmail) {
      try {
        const found = staffId
          ? await base44.asServiceRole.entities.SalesTeamMember.filter({ id: staffId })
          : await base44.asServiceRole.entities.SalesTeamMember.filter({ email: staffEmail });
        const member = rowsOf(found)[0];
        if (member && member.role === "admin" && member.is_active !== false) isAdmin = true;
      } catch {
        isAdmin = false;
      }
    }
  }

  const bodyEmail = String(body?.clientEmail || body?.client_email || body?.email || "").trim().toLowerCase();

  // A customer identity is accepted only from a verified session. Without one the customer branch
  // carries no address at all, so every owner/team check downstream fails closed. Administrators keep
  // their existing behaviour; the automated sweeps act on isAdmin, never on a claimed address.
  let verifiedEmail = "";
  try {
    const verified = await requireCustomer(base44, null as any, body);
    if (verified.ok) verifiedEmail = verified.actor.email;
  } catch {
    verifiedEmail = "";
  }

  const email = isAdmin
    ? String((!isSystemSession && platformEmail) || bodyEmail).trim().toLowerCase()
    : verifiedEmail;

  return { email, isAdmin };
}

export function actorOwnsEmail(email: any, actor: VisibilityActor): boolean {
  const target = String(email || "").trim().toLowerCase();
  return !!target && !!actor?.email && target === actor.email;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}