import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeEditingAnalytics } from '../../shared/editingQueueEngine.ts';

/**
 * Returns editing analytics for staffing/capacity decisions.
 * Includes weekly/monthly volume, editing hours, averages, backlog,
 * quality metrics, editor utilization, and capacity indicators.
 */
Deno.serve(async (req) => {
  try {
    // Read body FIRST — use clone to avoid stream consumption issues
    let body = {};
    try {
      const bodyText = await req.clone().text();
      if (bodyText) body = JSON.parse(bodyText);
    } catch (e) { /* empty body */ }

    const url = new URL(req.url);
    const queryEmail = url.searchParams.get('email');
    const querySalesMemberId = url.searchParams.get('sales_member_id');

    const base44 = createClientFromRequest(req);

    // Check platform auth role first
    let platformEmail = null;
    let isPlatformAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user) {
        platformEmail = user.email;
        isPlatformAdmin = user.role === 'admin';
      }
    } catch (e) { /* not logged in via platform auth */ }

    // If not platform admin, check SalesTeamMember role (by email or ID)
    if (!isPlatformAdmin) {
      const salesEmail = body.email || queryEmail || platformEmail;
      const salesMemberId = body.sales_member_id || querySalesMemberId;
      let member = null;
      if (salesEmail || salesMemberId) {
        const members = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
        if (salesMemberId) {
          member = members.find((m) => m.id === salesMemberId);
        }
        if (!member && salesEmail) {
          member = members.find((m) =>
            m.email && m.email.toLowerCase() === salesEmail.toLowerCase()
          );
        }
      }
      if (!member || member.role !== 'admin') {
        return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
      }
    }

    const daysBack = parseInt(url.searchParams.get('days') || '30', 10);

    const analytics = await computeEditingAnalytics(base44, daysBack);

    return Response.json({ success: true, analytics });
  } catch (error) {
    console.error('getEditingAnalytics error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});