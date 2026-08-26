import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Briefcase, Users, Video, FileText, Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTenantBrand } from "@/components/TenantThemeProvider";
import { createPageUrl } from "@/utils";

export default function RecruitingDashboardWidget() {
  const { tenant } = useTenantBrand();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant?.hireiq_enabled) { setLoading(false); return; }
    (async () => {
      try {
        const [jobs, candidates, interviews, offers] = await Promise.all([
          base44.entities.HireJob.list("-created_date", 200),
          base44.entities.HireCandidate.list("-created_date", 200),
          base44.entities.HireInterview.list("-interview_date", 200),
          base44.entities.HireCandidate.filter({ hiring_status: "offered" }, "-created_date", 100),
        ]);
        const jobsData = jobs?.data ?? jobs ?? [];
        const candidatesData = candidates?.data ?? candidates ?? [];
        const interviewsData = interviews?.data ?? interviews ?? [];
        const offersData = offers?.data ?? offers ?? [];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        setStats({
          openPositions: jobsData.filter(j => j.status === "open").length,
          candidatesThisWeek: candidatesData.filter(c => new Date(c.created_date) >= weekAgo).length,
          interviews: interviewsData.filter(iv => iv.status === "scheduled").length,
          offersPending: offersData.length,
        });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [tenant?.hireiq_enabled]);

  if (!tenant?.hireiq_enabled) return null;
  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (!stats) return null;

  const widgets = [
    { label: "Open Positions", value: stats.openPositions, icon: Briefcase, color: "text-blue-600 bg-blue-50", tab: "jobs" },
    { label: "Candidates This Week", value: stats.candidatesThisWeek, icon: Users, color: "text-slate-600 bg-slate-100", tab: "candidates" },
    { label: "Interviews", value: stats.interviews, icon: Video, color: "text-purple-600 bg-purple-50", tab: "interviews" },
    { label: "Offers Pending", value: stats.offersPending, icon: FileText, color: "text-amber-600 bg-amber-50", tab: "offers" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#16A34A]" /> Recruiting
          <span className="text-xs font-normal text-slate-400">Powered by Khetha IQ</span>
        </h2>
        <Link to={createPageUrl("KhethaIQ")} className="text-xs text-[#2563EB] hover:underline">View Recruiting â</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {widgets.map((w) => {
          const Icon = w.icon;
          return (
            <Link key={w.label} to={createPageUrl("KhethaIQ") + `?view=${w.tab}`} className="hover:no-underline">
              <Card className="border-2 border-[#16A34A]/15 bg-white hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${w.color}`}><Icon className="w-4 h-4" /></div>
                    <span className="text-xs text-slate-500">{w.label}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{w.value}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}