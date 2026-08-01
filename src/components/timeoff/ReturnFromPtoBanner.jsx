import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Mail, CalendarDays, Briefcase, ClipboardList, X } from "lucide-react";
import { createPageUrl } from "@/utils";

export default function ReturnFromPtoBanner({ salesMemberId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!salesMemberId) return;
    (async () => {
      try {
        const res = await base44.functions.invoke("manageTimeOff", { action: "get_return_summary", sales_member_id: salesMemberId });
        setData(res.data || res);
      } catch (err) { console.error(err); }
      setLoading(false);
    })();
  }, [salesMemberId]);

  if (loading || dismissed || !data?.has_return) return null;

  const s = data.summary;
  const leaveType = data.leave?.leave_type || "PTO";

  return (
    <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 relative">
      <button onClick={() => setDismissed(true)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">👋</span>
        <h3 className="text-sm font-bold text-slate-900">Welcome Back!</h3>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        You were on {leaveType} from {new Date(data.leave.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} to {new Date(data.leave.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <ReturnStat icon={Mail} label="Contacts Responded" value={s.contacts_responded} />
        <ReturnStat icon={CalendarDays} label="Meetings Rescheduled" value={s.meetings_rescheduled} />
        <ReturnStat icon={Briefcase} label="Opportunities Updated" value={s.opportunities_updated} />
        <ReturnStat icon={ClipboardList} label="Follow-ups Due Today" value={s.followups_due_today} />
      </div>
      <Button size="sm" className="text-xs h-8" onClick={() => window.location.href = createPageUrl("HubSpotActivityLog")}>
        Review My Day
      </Button>
    </div>
  );
}

function ReturnStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white/60 border border-blue-100">
      <Icon className="w-3.5 h-3.5 text-[#2563EB]" />
      <div>
        <p className="text-base font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-[10px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}