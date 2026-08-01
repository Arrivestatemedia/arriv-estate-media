import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertCircle, Users, CalendarDays, ShieldAlert, Plane } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import TimeOffCalendar from "./TimeOffCalendar";
import AbsenceImpactPanel from "./AbsenceImpactPanel";

const LEAVE_LABELS = { pto: "PTO", sick: "Sick", personal: "Personal", unpaid: "Unpaid", bereavement: "Bereavement", jury_duty: "Jury Duty", other: "Other" };

function formatDateRange(start, end) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (start === end) return s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function ManagerTimeOff({ salesMemberId }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionDialog, setActionDialog] = useState(null);
  const [managerNote, setManagerNote] = useState("");
  const [actioning, setActioning] = useState(false);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageTimeOff", { action: "get_team_time_off", sales_member_id: salesMemberId });
      setData(res.data || res);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAction = async () => {
    if (!actionDialog) return;
    setActioning(true);
    try {
      const actionMap = { approve: "approve_request", deny: "deny_request", changes: "request_changes" };
      const res = await base44.functions.invoke("manageTimeOff", {
        action: actionMap[actionDialog.action],
        request_id: actionDialog.request.request_id,
        manager_sales_member_id: salesMemberId,
        manager_note: managerNote,
      });
      const d = res.data || res;
      if (d.error) throw new Error(d.error);
      toast({ title: `Request ${actionDialog.action === "approve" ? "approved" : actionDialog.action === "deny" ? "denied" : "returned for changes"}` });
      setActionDialog(null);
      setManagerNote("");
      loadData();
    } catch (err) {
      toast({ title: err.message || "Failed to action request", variant: "destructive" });
    }
    setActioning(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-400">Loading team time off...</div>;
  if (!data) return null;

  const { pending = [], currently_off = [], upcoming = [], coverage_warnings = [] } = data;

  const PendingCard = ({ r }) => (
    <div className="p-3 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-medium text-slate-900">{r.employee_name}</span>
          <span className="text-xs text-slate-400 ml-2">{LEAVE_LABELS[r.leave_type]}</span>
        </div>
        <span className="text-xs text-slate-500">{formatDateRange(r.start_date, r.end_date)} · {r.hours_requested}h</span>
      </div>
      {r.employee_note && <p className="text-xs text-slate-500 italic mb-2">"{r.employee_note}"</p>}
      <div className="mb-2">
        <AbsenceImpactPanel salesMemberId={r.employee_id} startDate={r.start_date} endDate={r.end_date} compact />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setActionDialog({ request: r, action: "approve" })} className="bg-green-600 hover:bg-green-700 text-xs h-8">
          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => setActionDialog({ request: r, action: "changes" })} className="text-xs h-8">
          <AlertCircle className="w-3.5 h-3.5" /> Request Changes
        </Button>
        <Button size="sm" variant="outline" onClick={() => setActionDialog({ request: r, action: "deny" })} className="text-red-600 hover:text-red-700 text-xs h-8">
          <XCircle className="w-3.5 h-3.5" /> Deny
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-[#2563EB]" />
        <h2 className="text-lg font-semibold text-slate-900">Team Time Off</h2>
      </div>

      {currently_off.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Currently Out</h3>
          <div className="space-y-2">
            {currently_off.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Plane className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-900">{r.employee_name}</span>
                  <span className="text-xs text-slate-500 ml-2">{LEAVE_LABELS[r.leave_type]} · Returns {new Date(r.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
                <span className="text-xs text-blue-600 font-medium">Out of Office</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {coverage_warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-900">Coverage Warnings</h3>
          </div>
          {coverage_warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 mt-1">
              {w.count} employees off on {new Date(w.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: {w.names.join(", ")}
            </p>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Pending Approvals ({pending.length})</h3>
          <div className="space-y-2">{pending.map((r) => <PendingCard key={r.id} r={r} />)}</div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Approved Upcoming PTO</h3>
          <div className="space-y-2">
            {upcoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-slate-900">{r.employee_name}</span>
                  <span className="text-xs text-slate-500 ml-2">{formatDateRange(r.start_date, r.end_date)} · {r.hours_requested}h</span>
                </div>
                <span className="text-xs text-green-600 font-medium">Approved</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <TimeOffCalendar approved={[...currently_off, ...upcoming]} />

      {pending.length === 0 && currently_off.length === 0 && upcoming.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No team time off activity</p>
        </div>
      )}

      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === "approve" && "Approve Time Off Request"}
              {actionDialog?.action === "deny" && "Deny Time Off Request"}
              {actionDialog?.action === "changes" && "Request Changes"}
            </DialogTitle>
          </DialogHeader>
          {actionDialog && (
            <div className="space-y-3">
              <div className="text-sm text-slate-600">
                <strong>{actionDialog.request.employee_name}</strong> — {LEAVE_LABELS[actionDialog.request.leave_type]}
                <br />{formatDateRange(actionDialog.request.start_date, actionDialog.request.end_date)} · {actionDialog.request.hours_requested}h
              </div>
              <Textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} placeholder="Add a note for the employee..." rows={3} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAction}
              disabled={actioning}
              className={actionDialog?.action === "approve" ? "bg-green-600 hover:bg-green-700" : actionDialog?.action === "deny" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {actioning ? "Processing..." : actionDialog?.action === "approve" ? "Approve" : actionDialog?.action === "deny" ? "Deny" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}