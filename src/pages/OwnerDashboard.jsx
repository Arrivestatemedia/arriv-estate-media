import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import KpiCard from "@/components/performance/KpiCard";
import GoalManager from "@/components/performance/GoalManager";
import CultureManager from "@/components/performance/CultureManager";

const SORT_OPTIONS = [
  { key: "revenue", label: "Highest Revenue" },
  { key: "calls", label: "Most Calls" },
  { key: "conversations", label: "Most Conversations" },
  { key: "closeRate", label: "Highest Close Rate" },
  { key: "meetings", label: "Most Meetings" },
  { key: "newClients", label: "Most New Clients" },
  { key: "followups", label: "Best Follow-up Rate" },
];

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("revenue");

  useEffect(() => {
    (async () => {
      try {
        const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
        const res = await base44.functions.invoke("getOwnerDashboard", { sales_member_id: salesMemberId });
        setData(res.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading company dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-slate-400">Admin access required.</div>;

  const sorted = [...(data.rankings || [])].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Owner Dashboard</h1>
      <p className="text-slate-500 mb-6">Company-wide sales performance · {data.memberCount} reps</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard kpi="revenue" value={data.totals.totalRevenue} />
        <KpiCard kpi="newContacts" value={data.totals.totalLeads} />
        <KpiCard kpi="dealsWon" value={data.totals.totalClients} />
        <KpiCard kpi="closeRate" value={data.totals.avgCloseRate} />
        <KpiCard kpi="avgDealSize" value={data.totals.avgRevenuePerClient} />
        <KpiCard kpi="revenue" value={data.totals.pipelineValue} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-[#2563EB]/15 rounded-xl p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Revenue by Market</h3>
          {data.revenueByMarket.map((m) => (
            <div key={m.market} className="flex justify-between py-2 border-b border-slate-50">
              <span className="text-sm text-slate-600">{m.market}</span>
              <span className="text-sm font-bold text-[#2563EB]">${m.revenue.toLocaleString()}</span>
            </div>
          ))}
          {data.revenueByMarket.length === 0 && <p className="text-sm text-slate-400">No revenue yet</p>}
        </div>
        <div className="bg-white border border-[#2563EB]/15 rounded-xl p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Daily Team Activity</h3>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard kpi="calls" value={data.teamActivity.calls} />
            <KpiCard kpi="emails" value={data.teamActivity.emails} />
            <KpiCard kpi="texts" value={data.teamActivity.texts} />
            <KpiCard kpi="meetings" value={data.teamActivity.appointments} />
          </div>
        </div>
      </div>

      <div className="bg-white border border-[#2563EB]/15 rounded-xl p-5 shadow-sm mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-base font-semibold text-slate-900">Team Performance Rankings</h3>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-3 py-1.5">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-xs uppercase">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Rep</th>
                <th className="text-right py-2 px-2">Calls</th>
                <th className="text-right py-2 px-2">Convos</th>
                <th className="text-right py-2 px-2">Close %</th>
                <th className="text-right py-2 px-2">Revenue</th>
                <th className="text-right py-2 px-2">Meetings</th>
                <th className="text-right py-2 px-2">New Clients</th>
                <th className="text-right py-2 px-2">Follow-ups</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 px-2 font-bold text-[#2563EB]">{i + 1}</td>
                  <td className="py-2 px-2">
                    <Link to={`/EmployeeProfile?sales_member_id=${r.id}`} className="font-medium text-slate-700 hover:text-[#2563EB]">{r.name}</Link>
                  </td>
                  <td className="text-right py-2 px-2">{r.calls}</td>
                  <td className="text-right py-2 px-2">{r.conversations}</td>
                  <td className="text-right py-2 px-2">{r.closeRate}%</td>
                  <td className="text-right py-2 px-2 font-medium">${r.revenue.toLocaleString()}</td>
                  <td className="text-right py-2 px-2">{r.meetings}</td>
                  <td className="text-right py-2 px-2">{r.newClients}</td>
                  <td className="text-right py-2 px-2">{r.followups}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No team members yet.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GoalManager />
        <CultureManager />
      </div>
    </div>
  );
}