import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from "recharts";
import { BarChart3, TrendingDown, Search, CheckCircle, XCircle } from "lucide-react";
import { getCampaignAnalytics } from "@/lib/recruitingApi";

export default function RecruitingAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCampaignAnalytics()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#FFFBF5]">
        <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-[#1A1A1A]/50 bg-[#FFFBF5]">
        Failed to load analytics
      </div>
    );
  }

  const { funnel, searches_by_day, total_searches, completed_searches, failed_searches } = data;

  const funnelData = [
    { name: "Sourced", value: funnel.sourced, fill: "#D4A574" },
    { name: "Saved", value: funnel.saved, fill: "#C9A87B" },
    { name: "Approved", value: funnel.approved, fill: "#B8956A" },
    { name: "Contacted", value: funnel.contacted, fill: "#A68559" },
    { name: "Responded", value: funnel.responded, fill: "#8B6F47" },
    { name: "Converted", value: funnel.converted, fill: "#6B5535" },
  ].filter((d) => d.value > 0);

  const dayData = Object.entries(searches_by_day)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, count]) => ({ day: day.slice(5), count }));

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Campaign Analytics</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">Recruiting funnel and search performance</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <Search className="w-5 h-5 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{total_searches}</p>
            <p className="text-xs text-[#1A1A1A]/60">Total Searches</p>
          </div>
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <CheckCircle className="w-5 h-5 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{completed_searches}</p>
            <p className="text-xs text-[#1A1A1A]/60">Completed</p>
          </div>
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <XCircle className="w-5 h-5 text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{failed_searches}</p>
            <p className="text-xs text-[#1A1A1A]/60">Failed</p>
          </div>
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <TrendingDown className="w-5 h-5 text-[#B8956A] mb-2" />
            <p className="text-2xl font-bold text-[#1A1A1A]">
              {funnel.sourced > 0 ? ((funnel.converted / funnel.sourced) * 100).toFixed(1) : 0}%
            </p>
            <p className="text-xs text-[#1A1A1A]/60">Conversion Rate</p>
          </div>
        </div>

        {/* Funnel chart */}
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-[#B8956A]" />
            <h3 className="font-semibold text-[#1A1A1A]">Recruiting Funnel</h3>
          </div>
          {funnelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 20, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#B8956A20" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#1A1A1A99" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 13, fill: "#1A1A1A" }} width={80} />
                <Tooltip
                  contentStyle={{ background: "#1A1A1A", border: "1px solid #B8956A", borderRadius: "8px", color: "#FFFBF5" }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry, i) => (
                    <Bar key={i} dataKey="value" fill={entry.fill} />
                  ))}
                  <LabelList dataKey="value" position="right" style={{ fill: "#1A1A1A", fontSize: 13, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[#1A1A1A]/50 text-center py-12">No funnel data yet</p>
          )}
        </div>

        {/* Searches per day */}
        {dayData.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
            <h3 className="font-semibold text-[#1A1A1A] mb-4">Searches Over Time (last 14 days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={dayData} margin={{ left: 0, right: 0, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#B8956A20" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#1A1A1A99" }} />
                <YAxis tick={{ fontSize: 12, fill: "#1A1A1A99" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1A1A1A", border: "1px solid #B8956A", borderRadius: "8px", color: "#FFFBF5" }}
                />
                <Bar dataKey="count" fill="#B8956A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}