import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Video, Loader2, AlertTriangle, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

export default function InterviewSchedulerModal({ app, onClose, onScheduled }) {
  const [interviewMode, setInterviewMode] = useState("human"); // "human" | "async"
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("16:30");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [loading, setLoading] = useState(false);
  const [organizer, setOrganizer] = useState(null);
  const [existingConfs, setExistingConfs] = useState([]);
  const [conflict, setConflict] = useState(null);

  useEffect(() => {
    const getItem = (k) => localStorage.getItem(k) || sessionStorage.getItem(k);
    const salesId = getItem('sales_member_id');
    const salesName = getItem('sales_member_name');
    const salesEmail = getItem('sales_member_email');
    if (salesId && salesName) {
      setOrganizer({ id: salesId, full_name: salesName, email: salesEmail || '' });
    } else {
      base44.auth.me().then(setOrganizer).catch(() => setOrganizer(null));
    }
    base44.entities.Conference.filter({ status: "scheduled" }, "-scheduled_date", 500)
      .then(res => {
        const list = res?.data ?? res ?? [];
        setExistingConfs(Array.isArray(list) ? list : []);
      })
      .catch(() => setExistingConfs([]));
  }, []);

  // Live conflict check — only for human mode
  useEffect(() => {
    if (interviewMode !== "human" || !scheduledDate || !scheduledTime) { setConflict(null); return; }
    const [y, m, d] = scheduledDate.split('-').map(Number);
    const [h, mi] = scheduledTime.split(':').map(Number);
    const reqStart = new Date(Date.UTC(y, m - 1, d, h, mi));
    const reqEnd = new Date(reqStart.getTime() + (durationMinutes || 0) * 60000);
    const found = existingConfs.find(conf => {
      if (!conf.scheduled_date || !conf.scheduled_time) return false;
      if ((conf.interview_mode || "human") === "ai") return false; // AI interviews don't conflict
      const [cy, cm, cd] = conf.scheduled_date.split('-').map(Number);
      const [ch, cmi] = conf.scheduled_time.split(':').map(Number);
      const cStart = new Date(Date.UTC(cy, cm - 1, cd, ch, cmi));
      const cEnd = new Date(cStart.getTime() + (conf.duration_minutes || 60) * 60000);
      return reqStart < cEnd && cStart < reqEnd;
    });
    setConflict(found || null);
  }, [scheduledDate, scheduledTime, durationMinutes, existingConfs, interviewMode]);

  const handleSchedule = async () => {
    if (interviewMode === "human" && (!scheduledDate || !scheduledTime)) {
      toast.error("Please choose a date and time");
      return;
    }
    if (!organizer) {
      toast.error("Could not load your admin profile");
      return;
    }

    setLoading(true);
    try {
      if (interviewMode === "async") {
        // Async mode: create an InterviewSession and send the 48-hour invitation email immediately
        const res = await base44.functions.invoke("inviteToAsyncInterview", {
          applicationId: app.id,
          deadlineHours: 48,
          createdBy: organizer.id,
        });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        if (data?.status === "exists") {
          toast.info("An active async interview invitation already exists for this candidate.");
        } else if (data?.email_sent) {
          toast.success("Async interview invitation sent. Candidate has 48 hours to complete it.");
        } else {
          toast.warning("Async interview session created, but the email may not have delivered. Check the candidate's email.");
        }
        if (onScheduled) onScheduled(data?.session || data);
        onClose();
      } else {
        // Human mode: schedule a video interview with date/time
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
          interviewMode: "human",
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
      }
    } catch (error) {
      console.error("Error scheduling interview:", error);
      toast.error(error.message || "Failed to schedule interview");
    } finally {
      setLoading(false);
    }
  };

  const minDate = moment().format("YYYY-MM-DD");
  const isAsync = interviewMode === "async";

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

        {/* Interview mode selection */}
        <div className="mb-4">
          <Label className="block text-sm font-medium text-gray-700 mb-2">Interview Format</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setInterviewMode("human")}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                !isAsync
                  ? "border-[#B8956A] bg-[#B8956A]/8"
                  : "border-gray-200 hover:border-[#B8956A]/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Video className="w-4 h-4" style={{ color: isAsync ? "#9ca3af" : "#B8956A" }} />
                <span className="text-sm font-semibold text-gray-900">Human Interview</span>
              </div>
              <p className="text-xs text-gray-500">Schedule a live video interview at a specific date & time.</p>
            </button>
            <button
              type="button"
              onClick={() => setInterviewMode("async")}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                isAsync
                  ? "border-[#B8956A] bg-[#B8956A]/8"
                  : "border-gray-200 hover:border-[#B8956A]/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4" style={{ color: isAsync ? "#B8956A" : "#9ca3af" }} />
                <span className="text-sm font-semibold text-gray-900">Async Interview</span>
              </div>
              <p className="text-xs text-gray-500">Candidate gets 48 hours to complete it on their own time.</p>
            </button>
          </div>
        </div>

        {isAsync ? (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-900 font-medium">Async invitation email sent immediately</p>
              <p className="text-xs text-blue-700 mt-0.5">
                The candidate will receive an email with a secure link to complete their first-round interview.
                They'll have <strong>48 hours from now</strong> to finish it, choosing between Conversational (Ashley AI)
                or Self-Guided Video format.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            This schedules a live video interview through Arriv's built-in calling system, sends the applicant a Google Calendar invite, and emails them the join link.
          </p>
        )}

        <div className="space-y-4">
          {!isAsync && (
            <>
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
            </>
          )}
        </div>

        {conflict && !isAsync && (
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
            disabled={loading || (!isAsync && !!conflict)}
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {isAsync ? "Sending..." : "Scheduling..."}</>
            ) : (
              isAsync ? "Send Async Invitation" : "Schedule & Send Invites"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}