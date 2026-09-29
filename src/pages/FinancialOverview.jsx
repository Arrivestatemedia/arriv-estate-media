import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Wallet, TrendingUp, DollarSign, Clock, Users, Briefcase, Loader2 } from "lucide-react";

export default function FinancialOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getFinancialOverview", {});
        setData(res.data || res);
      } catch (e) {
        setError(e.message || "Failed to load financial data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500 mb-2">{error}</p>
        <p className="text-sm text-slate-500">Admin access required to view financial data.</p>
      </div>
    );
  }

  const { totals, jobs, specialistBreakdown } = data;
  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const margin = totals.total_earned > 0
    ? Math.round((totals.total_profit / totals.total_earned) * 100)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-serif text-[#1A1A1A] mb-1">Financial Overview</h1>
        <p className="text-[#1A1A1A]/50">Revenue vs. media specialist payouts · {totals.total_jobs} jobs worked</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#B8956A]/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-[#B8956A]" />
            </div>
            <span className="text-xs text-[#1A1A1A]/50 font-medium">Total Earned</span>
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{fmt(totals.total_earned)}</p>
          <p className="text-xs text-[#1A1A1A]/40 mt-1">Client revenue</p>
        </div>

        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A]/5 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-[#1A1A1A]" />
            </div>
            <span className="text-xs text-[#1A1A1A]/50 font-medium">Total Paid Out</span>
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{fmt(totals.total_paid_out)}</p>
          <p className="text-xs text-[#1A1A1A]/40 mt-1">To specialists</p>
        </div>

        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#B8956A]/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-[#B8956A]" />
            </div>
            <span className="text-xs text-[#1A1A1A]/50 font-medium">Net Profit</span>
          </div>
          <p className="text-2xl font-bold text-[#B8956A]">{fmt(totals.total_profit)}</p>
          <p className="text-xs text-[#1A1A1A]/40 mt-1">{margin}% margin</p>
        </div>

        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A]/5 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[#1A1A1A]" />
            </div>
            <span className="text-xs text-[#1A1A1A]/50 font-medium">Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{fmt(totals.total_outstanding)}</p>
          <p className="text-xs text-[#1A1A1A]/40 mt-1">Not yet paid</p>
        </div>
      </div>

      {/* Specialist Breakdown */}
      <div className="bg-white border border-[#B8956A]/20 rounded-xl shadow-sm mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#B8956A]/15 flex items-center gap-2">
          <Users className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Media Specialist Earnings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#FFFBF5] text-left text-xs text-[#1A1A1A]/50 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Specialist</th>
                <th className="px-5 py-3 font-medium text-center">Jobs Worked</th>
                <th className="px-5 py-3 font-medium text-right">Total Earned</th>
                <th className="px-5 py-3 font-medium text-right">Paid Out</th>
                <th className="px-5 py-3 font-medium text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {specialistBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[#1A1A1A]/40 text-sm">
                    No specialists have worked jobs yet.
                  </td>
                </tr>
              ) : (
                specialistBreakdown.map((s, i) => (
                  <tr key={i} className="border-t border-[#B8956A]/10 hover:bg-[#FFFBF5]/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-[#1A1A1A]">{s.name}</p>
                      <p className="text-xs text-[#1A1A1A]/40">{s.email}</p>
                    </td>
                    <td className="px-5 py-3 text-center text-[#1A1A1A]">{s.jobs_worked}</td>
                    <td className="px-5 py-3 text-right font-semibold text-[#1A1A1A]">{fmt(s.total_earned)}</td>
                    <td className="px-5 py-3 text-right text-[#1A1A1A]/70">{fmt(s.total_paid_out)}</td>
                    <td className="px-5 py-3 text-right text-[#1A1A1A]/70">{fmt(s.total_outstanding)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Jobs Worked Table */}
      <div className="bg-white border border-[#B8956A]/20 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#B8956A]/15 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-[#B8956A]" />
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Jobs Worked</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#FFFBF5] text-left text-xs text-[#1A1A1A]/50 uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Specialist</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium text-right">Earned</th>
                <th className="px-5 py-3 font-medium text-right">Payout</th>
                <th className="px-5 py-3 font-medium text-right">Profit</th>
                <th className="px-5 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[#1A1A1A]/40 text-sm">
                    No completed jobs yet.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="border-t border-[#B8956A]/10 hover:bg-[#FFFBF5]/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-medium text-[#1A1A1A] text-sm">{job.title}</p>
                      <p className="text-xs text-[#1A1A1A]/40">{job.location}</p>
                    </td>
                    <td className="px-5 py-3 text-sm text-[#1A1A1A]/70">{job.specialist_name}</td>
                    <td className="px-5 py-3 text-sm text-[#1A1A1A]/70">
                      {job.date ? new Date(job.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-[#1A1A1A]">{fmt(job.revenue)}</td>
                    <td className="px-5 py-3 text-right text-[#1A1A1A]/70">{fmt(job.payout)}</td>
                    <td className="px-5 py-3 text-right font-medium text-[#B8956A]">{fmt(job.profit)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        job.paid_out
                          ? 'bg-[#B8956A]/15 text-[#B8956A]'
                          : 'bg-[#1A1A1A]/5 text-[#1A1A1A]/50'
                      }`}>
                        {job.paid_out ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}