import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Video, Loader2, AlertTriangle, Brain } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

export default function InterviewSchedulerModal({ app, onClose, onScheduled }) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("16:30");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [organizer, setOrganizer] = useState(null);
  const [existingConfs, setExistingConfs] = useState([]);
  const [conflict, setConflict] = useState(null);
  const [useAiInterviewer, setUseAiInterviewer] = useState(false);

  useEffect(() => {
    // This app uses custom sales auth (localStorage) — try that first,
    // then fall back to Base44 platform auth for platform admins.
    const getItem = (k) => localStorage.getItem(k) || sessionStorage.getItem(k);
    const salesId = getItem('sales_member_id');
    const salesName = getItem('sales_member_name');
    const salesEmail = getItem('sales_member_email');
    if (salesId && salesName) {
      setOrganizer({ id: salesId, full_name: salesName, email: salesEmail || '' });
    } else {
      base44.auth.me().then(setOrganizer).catch(() => setOrganizer(null));
    }
    // Load existing scheduled interviews for conflict detection
    base44.entities.Conference.filter({ status: "scheduled" }, "-scheduled_date", 500)
      .then(res => {
        const list = res?.data ?? res ?? [];
        setExistingConfs(Array.isArray(list) ? list : []);
      })
      .catch(() => setExistingConfs([]));
  }, []);

  // Live conflict check whenever date/time/duration changes
  useEffect(() => {
    if (!scheduledDate || !scheduledTime) { setConflict(null); return; }
    const [y, m, d] = scheduledDate.split('-').map(Number);
    const [h, mi] = scheduledTime.split(':').map(Number);
    const reqStart = new Date(Date.UTC(y, m - 1, d, h, mi));
    const reqEnd = new Date(reqStart.getTime() + (durationMinutes || 0) * 60000);
    const newMode = useAiInterviewer ? "ai" : "human";
    const found = existingConfs.find(conf => {
      if (!conf.scheduled_date || !conf.scheduled_time) return false;
      // AI interviews can run concurrently; only block overlaps involving a human interview.
      if (newMode === "ai" && (conf.interview_mode || "human") === "ai") return false;
      const [cy, cm, cd] = conf.scheduled_date.split('-').map(Number);
      const [ch, cmi] = conf.scheduled_time.split(':').map(Number);
      const cStart = new Date(Date.UTC(cy, cm - 1, cd, ch, cmi));
      const cEnd = new Date(cStart.getTime() + (conf.duration_minutes || 60) * 60000);
      return reqStart < cEnd && cStart < reqEnd;
    });
    setConflict(found || null);
  }, [scheduledDate, scheduledTime, durationMinutes, existingConfs, useAiInterviewer]);

  const handleSchedule = async () => {
    if (!scheduledDate || !scheduledTime) {
      toast.error("Please choose a date and time");
      return;
    }
    if (!organizer) {
      toast.error("Could not load your admin profile");
      return;
    }

    setLoading(true);
    try {
      const title = `Sales Growth Advisor Interview — ${app.full_name}`;
      const description = `Interview with ${app.full_name} for the Sales Growth Advisor position at Arriv Estate Media.\n\nApplicant email: ${app.email}\nApplicant phone: ${app.phone || "N/A"}`;

      const confRes = await base44.functions.invoke("scheduleConference", {
        title,
        description,
        scheduledDate,
        scheduledTime,
        durationMinutes,
        participants: [{ id: app.id, name: app.full_name, email: app.email }],
        organizerId: organizer.id,
        organizerName: organizer.full_name,
        organizerEmail: organizer.email,
        applicationId: app.id,
        interviewMode: useAiInterviewer ? "ai" : "human",
      });

      if (!confRes?.data?.success) {
        throw new Error(confRes?.data?.error || "Failed to schedule interview");
      }

      const conference = confRes.data.conference;

      if (confRes.data.email_sent) {
        toast.success("Interview scheduled. Google invite + confirmation email sent to applicant.");
      } else {
        toast.warning("Interview scheduled, but the confirmation email may not have delivered. Use the resend option or check the applicant's email.");
      }
      if (onScheduled) onScheduled(conference);
      onClose();
    } catch (error) {
      console.error("Error scheduling interview:", error);
      toast.error(error.message || "Failed to schedule interview");
    } finally {
      setLoading(false);
    }
  };

  const minDate = moment().format("YYYY-MM-DD");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-xl font-semibold text-gray-900">Schedule Interview</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={loading}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="mb-4 p-3 bg-[#FFFBF5] border border-[#B8956A]/20 rounded-lg">
          <p className="text-sm font-medium text-gray-900">{app.full_name}</p>
          <p className="text-xs text-gray-500 break-all">{app.email}</p>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          This schedules a video interview through Arriv's built-in calling system, sends the applicant a Google Calendar invite, and emails them the join link.
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
            <p className="text-xs text-gray-400 mt-1">Interviews are typically Mon–Fri, 4:00–6:00 PM ET.</p>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors" style={{ backgroundColor: useAiInterviewer ? "rgba(184,149,106,0.08)" : "#FFFBF5", border: `1px solid ${useAiInterviewer ? "rgba(184,149,106,0.3)" : "rgba(184,149,106,0.15)"}` }}>
            <input
              type="checkbox"
              checked={useAiInterviewer}
              onChange={(e) => setUseAiInterviewer(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: "#B8956A" }}
            />
            <Brain className="w-4 h-4" style={{ color: "#B8956A" }} />
            <div>
              <p className="text-sm font-medium text-gray-900">Use AI Interviewer</p>
              <p className="text-xs text-gray-500">The applicant joins the same link and is interviewed by AI instead of a human interviewer.</p>
            </div>
          </label>
        </div>

        {conflict && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
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
            onClick={handleSchedule}
            disabled={loading || !!conflict}
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scheduling...</>
            ) : (
              "Schedule & Send Invites"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}