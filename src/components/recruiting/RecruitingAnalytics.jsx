import React, { useState, useEffect } from "react";
import { getCampaignAnalytics } from "@/lib/recruitingApi";
import { Loader2, Users, Bookmark, UserCheck, Mail, MessageSquare, UserPlus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const FUNNEL_STEPS = [
  { key: "found", label: "Found", icon: Users },
  { key: "saved", label: "Saved", icon: Bookmark },
  { key: "approved", label: "Approved", icon: UserCheck },
  { key: "contacted", label: "Contacted", icon: Mail },
  { key: "responded", label: "Responded", icon: MessageSquare },
  { key: "converted", label: "Converted", icon: UserPlus },
];

export default function RecruitingAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCampaignAnalytics().then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  if (!data) return <p style={{ color: MUTED }}>Unable to load analytics.</p>;

  const funnelData = FUNNEL_STEPS.map((s) => ({ name: s.label, count: data.funnel?.[s.key] || 0 }));
  const maxVal = Math.max(...funnelData.map((d) => d.count), 1);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-xl font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Campaign Analytics</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {FUNNEL_STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="p-4 rounded-xl" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-xs" style={{ color: "rgba(255,251,245,0.5)" }}>{s.label}</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#FFFBF5" }}>{data.funnel?.[s.key] || 0}</p>
            </div>
          );
        })}
      </div>

      <div className="p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
        <h3 className="font-bold mb-4" style={{ ...SERIF, color: TEXT_DARK }}>Recruiting Funnel</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={funnelData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.15)" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} />
            <YAxis tick={{ fontSize: 12, fill: MUTED }} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.3)", borderRadius: "8px", color: "#FFFBF5" }} />
            <Bar dataKey="count" fill="#B8956A" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.searches?.length > 0 && (
        <div className="mt-5 p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <h3 className="font-bold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>Recent Searches</h3>
          <div className="space-y-2">
            {data.searches.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.05)" }}>
                <div>
                  <span className="text-sm font-medium capitalize" style={{ color: TEXT_DARK }}>{s.strategy}</span>
                  <span className="text-xs ml-2" style={{ color: MUTED }}>{new Date(s.created_date).toLocaleDateString()}</span>
                </div>
                <div className="text-xs" style={{ color: MUTED }}>
                  {s.fresh_count} fresh / {s.results_count} found
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}