/**
 * Shared admin authorization helper for backend functions.
 * Checks platform admin role first, then falls back to SalesTeamMember admin role.
 */
export async function verifyAdmin(
  base44: any,
  body: any,
  url?: URL
): Promise<{ authorized: boolean; actor?: string; actorEmail?: string; error?: string }> {
  let platformEmail: string | null = null;
  let platformUserId: string | null = null;
  let isPlatformAdmin = false;

  try {
    const me = await base44.auth.me();
    if (me) {
      platformEmail = me.email;
      platformUserId = me.id;
      isPlatformAdmin = me.role === 'admin';
    }
  } catch { /* not logged in via platform auth */ }

  if (isPlatformAdmin) {
    return { authorized: true, actor: platformUserId!, actorEmail: platformEmail! };
  }

  const queryEmail = url?.searchParams.get('email');
  const querySalesMemberId = url?.searchParams.get('sales_member_id');
  const salesEmail = body?.email || queryEmail || platformEmail;
  const salesMemberId = body?.sales_member_id || querySalesMemberId;

  let member = null;
  if (salesEmail || salesMemberId) {
    const members = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
    if (salesMemberId) member = members.find((m) => m.id === salesMemberId);
    if (!member && salesEmail) {
      member = members.find((m) => m.email && m.email.toLowerCase() === salesEmail.toLowerCase());
    }
  }

  if (member && member.role === 'admin') {
    return { authorized: true, actor: member.id, actorEmail: member.email };
  }

  return { authorized: false, error: 'Unauthorized — admin only' };
}