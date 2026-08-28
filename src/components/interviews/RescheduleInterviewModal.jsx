import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, CalendarClock, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

export default function RescheduleInterviewModal({ conference, onClose, onRescheduled }) {
  const [scheduledDate, setScheduledDate] = useState(conference?.scheduled_date || "");
  const [scheduledTime, setScheduledTime] = useState(conference?.scheduled_time || "16:30");
  const [durationMinutes, setDurationMinutes] = useState(conference?.duration_minutes || 30);
  const [loading, setLoading] = useState(false);
  const [existingConfs, setExistingConfs] = useState([]);
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    base44.entities.Conference.filter({ status: "scheduled" }, "-scheduled_date", 500)
      .then(res => {
        const list = res?.data ?? res ?? [];
        setExistingConfs(Array.isArray(list) ? list : []);
      })
      .catch(() => setExistingConfs([]));
  }, []);

  // Live conflict check — exclude the conference being rescheduled
  useEffect(() => {
    if (!scheduledDate || !scheduledTime) { setConflict(null); return; }
    const [y, m, d] = scheduledDate.split('-').map(Number);
    const [h, mi] = scheduledTime.split(':').map(Number);
    const reqStart = new Date(Date.UTC(y, m - 1, d, h, mi));
    const reqEnd = new Date(reqStart.getTime() + (durationMinutes || 0) * 60000);
    const confMode = conference?.interview_mode || "human";
    const found = existingConfs.find(conf => {
      if (conf.id === conference?.id) return false; // exclude self
      if (!conf.scheduled_date || !conf.scheduled_time) return false;
      // AI interviews run themselves, so they never conflict with a human or
      // another AI interview. Only block when BOTH are human.
      if (confMode === "ai" || (conf.interview_mode || "human") === "ai") return false;
      const [cy, cm, cd] = conf.scheduled_date.split('-').map(Number);
      const [ch, cmi] = conf.scheduled_time.split(':').map(Number);
      const cStart = new Date(Date.UTC(cy, cm - 1, cd, ch, cmi));
      const cEnd = new Date(cStart.getTime() + (conf.duration_minutes || 60) * 60000);
      return reqStart < cEnd && cStart < reqEnd;
    });
    setConflict(found || null);
  }, [scheduledDate, scheduledTime, durationMinutes, existingConfs, conference?.id, conference?.interview_mode]);

  const handleReschedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      toast.error("Please choose a date and time");
      return;
    }
    setLoading(true);
    try {
      const res = await base44.functions.invoke("rescheduleConference", {
        conferenceId: conference.id,
        scheduledDate,
        scheduledTime,
        durationMinutes,
      });
      const data = res?.data ?? res;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to reschedule interview");
      }
      if (data.email_sent) {
        toast.success("Interview rescheduled. Updated calendar invite + email sent to applicant.");
      } else {
        toast.warning("Interview rescheduled, but the confirmation email may not have delivered.");
      }
      if (onRescheduled) onRescheduled();
      onClose();
    } catch (error) {
      console.error("Error rescheduling interview:", error);
      toast.error(error.message || "Failed to reschedule interview");
    } finally {
      setLoading(false);
    }
  };

  if (!conference) return null;

  const applicantName = conference.participants?.[0]?.name || conference.title || "Applicant";
  const applicantEmail = conference.participants?.[0]?.email || "";
  const minDate = moment().format("YYYY-MM-DD");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-xl font-semibold text-gray-900">Reschedule Interview</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={loading}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="mb-4 p-3 bg-[#FFFBF5] border border-[#B8956A]/20 rounded-lg">
          <p className="text-sm font-medium text-gray-900">{applicantName}</p>
          {applicantEmail && <p className="text-xs text-gray-500 break-all">{applicantEmail}</p>}
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Pick a new date and time. The applicant will receive an updated Google Calendar invite and a rescheduled confirmation email. The interview link stays the same.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-1">Date *</Label>
              <Input
                type="date"
                min={minDate}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="block text-sm font-medium text-gray-700 mb-1">Time *</Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">Eastern Time</p>
            </div>
          </div>

          <div>
            <Label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</Label>
            <Input
              type="number"
              min="15"
              max="120"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 30)}
            />
          </div>
        </div>

        {conflict && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2 mt-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">Time conflict detected</p>
              <p className="text-xs text-red-700 mt-0.5">
                Another interview is already scheduled on {conflict.scheduled_date} at {conflict.scheduled_time} ET.
                Please choose a different time.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleReschedule}
            disabled={loading || !!conflict}
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rescheduling...</>
            ) : (
              "Reschedule & Notify"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}