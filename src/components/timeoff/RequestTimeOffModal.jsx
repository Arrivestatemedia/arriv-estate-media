import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const LEAVE_TYPES = [
  { value: "pto", label: "PTO" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "bereavement", label: "Bereavement" },
  { value: "jury_duty", label: "Jury Duty" },
  { value: "other", label: "Other" },
];

export default function RequestTimeOffModal({ open, onOpenChange, salesMemberId, balances, onSubmitted }) {
  const { toast } = useToast();
  const [leaveType, setLeaveType] = useState("pto");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPartialDay, setIsPartialDay] = useState(false);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentBalance = useMemo(() => {
    const b = balances?.[leaveType] || balances?.pto || {};
    return b.balance_hours || 0;
  }, [balances, leaveType]);

  const calculatedHours = useMemo(() => {
    if (!startDate) return 0;
    if (isPartialDay) return parseFloat(hours) || 4;
    const end = endDate || startDate;
    const s = new Date(startDate + "T00:00:00Z");
    const e = new Date(end + "T00:00:00Z");
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    return Math.max(1, days) * 8;
  }, [startDate, endDate, isPartialDay, hours]);

  const projectedRemaining = Math.max(0, currentBalance - calculatedHours);

  const handleSubmit = async () => {
    if (!startDate) { toast({ title: "Please select a start date", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("manageTimeOff", {
        action: "submit_request",
        sales_member_id: salesMemberId,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate || startDate,
        is_partial_day: isPartialDay,
        hours_requested: isPartialDay ? parseFloat(hours) || 4 : null,
        employee_note: note,
      });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      toast({ title: "Time off request submitted" });
      onSubmitted?.();
      onOpenChange(false);
      setStartDate(""); setEndDate(""); setNote(""); setHours(""); setIsPartialDay(false); setLeaveType("pto");
    } catch (err) {
      toast({ title: err.message || "Failed to submit request", variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Leave Type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" disabled={isPartialDay} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="partial" checked={isPartialDay} onChange={(e) => setIsPartialDay(e.target.checked)} className="rounded" />
            <Label htmlFor="partial" className="text-sm font-normal cursor-pointer">Partial day</Label>
          </div>
          {isPartialDay && (
            <div>
              <Label>Hours</Label>
              <Input type="number" step="0.5" min="0.5" max="8" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="4" className="mt-1" />
            </div>
          )}
          <div>
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add any details for your manager..." className="mt-1" rows={2} />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Current Balance</span><span className="font-medium text-slate-900">{currentBalance.toFixed(1)}h</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Requested Hours</span><span className="font-medium text-slate-900">{calculatedHours.toFixed(1)}h</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1"><span className="text-slate-500">Projected Remaining</span><span className="font-bold text-[#2563EB]">{projectedRemaining.toFixed(1)}h</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Submitting..." : "Submit Request"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}