import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, CalendarOff, Clock, CheckCircle2, XCircle, AlertCircle, Plane } from "lucide-react";
import TimeOffBalanceCards from "./TimeOffBalanceCards";
import RequestTimeOffModal from "./RequestTimeOffModal";
import ReturnFromPtoBanner from "./ReturnFromPtoBanner";
import AbsenceImpactPanel from "./AbsenceImpactPanel";

const LEAVE_LABELS = { pto: "PTO", sick: "Sick", personal: "Personal", unpaid: "Unpaid", bereavement: "Bereavement", jury_duty: "Jury Duty", other: "Other" };
const STATUS_CONFIG = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  denied: { label: "Denied", icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
  changes_requested: { label: "Changes Requested", icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-50" },
  canceled: { label: "Canceled", icon: XCircle, color: "text-slate-400", bg: "bg-slate-50" },
};

function formatDateRange(start, end) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (start === end) return s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function MyTimeOff({ salesMemberId }) {
  const [balances, setBalances] = useState(null);
  const [balanceSource, setBalanceSource] = useState(null);
  const [requests, setRequests] = useState([]);
  const [currentlyOnLeave, setCurrentlyOnLeave] = useState(false);
  const [currentLeave, setCurrentLeave] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const [balRes, reqRes] = await Promise.all([
        base44.functions.invoke("manageTimeOff", { action: "get_balances", sales_member_id: salesMemberId }),
        base44.functions.invoke("manageTimeOff", { action: "get_my_requests", sales_member_id: salesMemberId }),
      ]);
      const balData = balRes.data || balRes;
      const reqData = reqRes.data || reqRes;
      setBalances(balData.balances);
      setBalanceSource(balData.source);
      setRequests(reqData.requests || []);
      setCurrentlyOnLeave(reqData.currently_on_leave);
      setCurrentLeave(reqData.current_leave);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading time off...</div>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = requests.filter((r) => r.status === "approved" && r.start_date > today);
  const pending = requests.filter((r) => r.status === "pending" || r.status === "changes_requested");
  const previous = requests.filter((r) => ["approved", "denied", "canceled"].includes(r.status) && r.end_date < today);

  const RequestCard = ({ r }) => {
    const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-900">{LEAVE_LABELS[r.leave_type] || r.leave_type}</span>
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{formatDateRange(r.start_date, r.end_date)} · {r.hours_requested}h</p>
          {r.employee_note && <p className="text-xs text-slate-400 mt-1 italic">"{r.employee_note}"</p>}
          {r.manager_note && r.status === "changes_requested" && <p className="text-xs text-blue-600 mt-1">Manager: {r.manager_note}</p>}
          {r.manager_note && r.status === "denied" && <p className="text-xs text-red-500 mt-1">Manager: {r.manager_note}</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <ReturnFromPtoBanner salesMemberId={salesMemberId} />

      {currentlyOnLeave && currentLeave && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex items-center gap-3">
          <Plane className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">You are currently on {LEAVE_LABELS[currentLeave.leave_type]} leave</p>
            <p className="text-xs text-blue-600">Returning {new Date(currentLeave.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">My Time Off</h2>
        <Button onClick={() => setShowRequest(true)} size="sm">
          <Plus className="w-4 h-4" /> Request Time Off
        </Button>
      </div>

      {balances && <TimeOffBalanceCards balances={balances} source={balanceSource} />}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Upcoming Time Off</h3>
          <div className="space-y-3">
            {upcoming.map((r) => (
              <div key={r.id} className="space-y-2">
                <RequestCard r={r} />
                <AbsenceImpactPanel salesMemberId={salesMemberId} startDate={r.start_date} endDate={r.end_date} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Pending Requests</h3>
          <div className="space-y-2">{pending.map((r) => <RequestCard key={r.id} r={r} />)}</div>
        </div>
      )}

      {previous.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Previous Requests</h3>
          <div className="space-y-2">{previous.slice(0, 10).map((r) => <RequestCard key={r.id} r={r} />)}</div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <CalendarOff className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No time off requests yet</p>
        </div>
      )}

      <RequestTimeOffModal
        open={showRequest}
        onOpenChange={setShowRequest}
        salesMemberId={salesMemberId}
        balances={balances}
        onSubmitted={loadData}
      />
    </div>
  );
}