import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  periodBounds,
  loadTenantData,
  computeTenantRollup,
  computePipeline,
  computeRevenueByMarket,
} from "../../shared/performanceEngine.ts";

async function resolveAdminTenant(base44, salesMemberId) {
  if (salesMemberId) {
    try {
      const m = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
      if (m?.[0]?.role === "admin") {
        return { tenantId: m[0].tenant_id || "", ok: true };
      }
    } catch {}
  }
  try {
    const u = await base44.auth.me();
    if (u && (u.role === "admin" || u.role === "tenant_admin")) {
      return { tenantId: u.tenant_id || "", ok: true };
    }
  } catch {}
  return { tenantId: "", ok: false };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { tenantId, ok } = await resolveAdminTenant(base44, body.sales_member_id);
    if (!ok) return Response.json({ error: "Admin access required" }, { status: 403 });

    const data = await loadTenantData(base44, tenantId);
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ tenant_id: tenantId });
    const activeMembers = members.filter((m) => m.is_active !== false);

    const dailyBounds = periodBounds("daily");
    const weeklyBounds = periodBounds("weekly");
    const dailyRollup = computeTenantRollup(data, activeMembers, dailyBounds.start, dailyBounds.end);
    const weeklyRollup = computeTenantRollup(data, activeMembers, weeklyBounds.start, weeklyBounds.end);

    const wonDeals = data.deals.filter((d) => d.status === "won" || d.status === "paid");
    const totalRevenue = wonDeals.reduce((s, d) => s + (d.amount_collected || d.contract_value || 0), 0);
    const totalLeads = data.contacts.length;
    const totalClients = wonDeals.length;
    const avgCloseRate = activeMembers.length > 0
      ? activeMembers.reduce((s, m) => s + (dailyRollup[m.id]?.closeRate || 0), 0) / activeMembers.length
      : 0;
    const avgRevenuePerClient = totalClients > 0 ? totalRevenue / totalClients : 0;
    const revenueByMarket = computeRevenueByMarket(data);

    const teamActivity = { calls: 0, emails: 0, texts: 0, appointments: 0 };
    for (const m of activeMembers) {
      const d = dailyRollup[m.id] || {};
      teamActivity.calls += d.calls || 0;
      teamActivity.emails += d.emails || 0;
      teamActivity.texts += d.texts || 0;
      teamActivity.appointments += d.appointments || 0;
    }

    const pipelineValue = data.deals
      .filter((d) => d.status === "open")
      .reduce((s, d) => s + (d.contract_value || 0), 0);

    const rankings = activeMembers.map((m) => {
      const w = weeklyRollup[m.id] || {};
      const d = dailyRollup[m.id] || {};
      return {
        id: m.id, name: m.full_name, title: m.title,
        calls: w.calls || 0, conversations: w.conversations || 0,
        closeRate: w.closeRate || 0, revenue: w.revenue || 0,
        meetings: w.meetings || 0, newClients: w.dealsWon || 0,
        followups: w.followups || 0, texts: w.texts || 0,
        emails: w.emails || 0, dailyCalls: d.calls || 0,
      };
    });

    return Response.json({
      totals: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalLeads, totalClients,
        avgCloseRate: Math.round(avgCloseRate * 10) / 10,
        avgRevenuePerClient: Math.round(avgRevenuePerClient * 100) / 100,
        pipelineValue: Math.round(pipelineValue * 100) / 100,
      },
      revenueByMarket,
      teamActivity,
      rankings,
      memberCount: activeMembers.length,
    });
  } catch (error) {
    console.error("getOwnerDashboard error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}