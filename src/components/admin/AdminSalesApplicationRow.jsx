import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SALES_STATUSES, getStatusLabel, getStatusColor, POSITION_LABELS } from "@/lib/applicationStatus";
import { ChevronDown, ChevronRight, Mail, Phone, MapPin, Briefcase, CalendarPlus, Trash2, UserCheck, Crown } from "lucide-react";
import moment from "moment";
import InterviewSchedulerModal from "./InterviewSchedulerModal";
import DeleteApplicationDialog from "./DeleteApplicationDialog";
import ReferenceCheckModal from "./ReferenceCheckModal";
import { Users } from "lucide-react";

export default function AdminSalesApplicationRow({ app, onUpdate, onDelete, autoExpand, autoAction, onAutoActionDone }) {
  const [expanded, setExpanded] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingRefs, setSendingRefs] = useState(false);
  const [refsMsg, setRefsMsg] = useState(null);
  const [sendingI2, setSendingI2] = useState(false);
  const [i2Msg, setI2Msg] = useState(null);
  const [showRefs, setShowRefs] = useState(false);
  const isSales = (app.position || "media_specialist") === "sales_growth_advisor";

  // Auto-expand and auto-act when navigated from a candidate decision
  useEffect(() => {
    if (autoExpand) setExpanded(true);
  }, [autoExpand]);

  useEffect(() => {
    if (!autoAction) return;
    if (autoAction.type === "select_status" && autoAction.status) {
      onUpdate(app.id, { status: autoAction.status });
      if (onAutoActionDone) onAutoActionDone();
    } else if (autoAction.type === "schedule_interview") {
      setShowScheduler(true);
      if (onAutoActionDone) onAutoActionDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAction]);

  if (!isSales) return null;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(app.id);
      setShowDelete(false);
    } catch (err) {
      alert("Failed to delete applicant: " + (err?.message || "Unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  const setStatus = (status) => onUpdate(app.id, { status });

  const statuses = SALES_STATUSES;

  return (
    <Card className="border-2 border-[var(--border-color)] bg-[var(--card-bg)]">
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? <ChevronDown className="w-5 h-5 text-[var(--text-secondary)]" /> : <ChevronRight className="w-5 h-5 text-[var(--text-secondary)]" />}
            <div>
              <CardTitle className="text-[var(--text-primary)]">{app.full_name}</CardTitle>
              <p className="text-xs text-[var(--text-secondary)]">
                {app.email} · Submitted {moment(app.created_date).format("MMM D, YYYY")}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-1 rounded-full">
              <Briefcase className="w-3 h-3" />
              {POSITION_LABELS.sales_growth_advisor}
            </div>
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: getStatusColor(app.status, statuses) }}
          >
            {getStatusLabel(app.status, statuses)}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          {/* Status control — sales-specific buttons */}
          <div className="space-y-2">
            <Label className="text-[var(--text-primary)] font-semibold">Status</Label>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                  style={
                    app.status === s.value
                      ? { backgroundColor: s.color, color: "white", borderColor: s.color }
                      : { borderColor: s.color, color: s.color, backgroundColor: "transparent" }
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-[var(--text-primary)]"><Mail className="w-4 h-4 text-[var(--accent-color)]" /> {app.email}</div>
            <div className="flex items-center gap-2 text-[var(--text-primary)]"><Phone className="w-4 h-4 text-[var(--accent-color)]" /> {app.phone}</div>
            <div className="flex items-center gap-2 text-[var(--text-primary)] sm:col-span-2"><MapPin className="w-4 h-4 text-[var(--accent-color)]" /> {app.address}</div>
          </div>

          {/* Application details */}
          <div className="space-y-2 text-sm border-t border-[var(--border-color)] pt-3">
            <p className="font-medium text-[var(--text-primary)]">LinkedIn</p>
            <a href={app.linkedin} target="_blank" rel="noreferrer" className="text-[var(--accent-color)] underline break-all">{app.linkedin}</a>
            <p className="font-medium text-[var(--text-primary)] mt-2">Resume / Portfolio</p>
            <a href={app.portfolio_link} target="_blank" rel="noreferrer" className="text-[var(--accent-color)] underline break-all">{app.portfolio_link}</a>
            <p className="font-medium text-[var(--text-primary)] mt-2">Last Related Job / Experience</p>
            <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{app.last_related_job}</p>
            <p className="font-medium text-[var(--text-primary)] mt-2">Why a Good Fit</p>
            <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{app.why_good_fit}</p>
          </div>

          {/* Schedule interview */}
          <div className="border-t border-[var(--border-color)] pt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowScheduler(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#B8956A] text-white hover:bg-[#A68559] transition-colors"
            >
              <CalendarPlus className="w-4 h-4" />
              Schedule Interview
            </button>
            <button
              onClick={async () => {
                setSendingI2(true);
                setI2Msg(null);
                try {
                  const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
                  const res = await base44.functions.invoke("sendSalesInterview2Invitation", { applicationId: app.id, salesMemberId });
                  if (res.data?.success) setI2Msg({ type: "success", text: `Founder conversation invite sent to ${app.email}` });
                  else setI2Msg({ type: "error", text: res.data?.error || "Failed to send." });
                } catch (err) {
                  setI2Msg({ type: "error", text: err?.data?.error || err?.message || "Failed to send." });
                } finally {
                  setSendingI2(false);
                }
              }}
              disabled={sendingI2}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#1A1A1A]/90 transition-colors disabled:opacity-60"
            >
              <Crown className="w-4 h-4" />
              {sendingI2 ? "Sending…" : "Interview #2"}
            </button>
            {i2Msg && (
              <span className={`text-xs ${i2Msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{i2Msg.text}</span>
            )}
            <button
              onClick={async () => {
                setSendingRefs(true);
                setRefsMsg(null);
                try {
                  const res = await base44.functions.invoke("sendReferenceCheckEmail", { applicationId: app.id });
                  if (res.data?.success) setRefsMsg({ type: "success", text: `Reference request sent to ${app.email}` });
                  else setRefsMsg({ type: "error", text: res.data?.error || "Failed to send." });
                } catch (err) {
                  setRefsMsg({ type: "error", text: err?.data?.error || err?.message || "Failed to send." });
                } finally {
                  setSendingRefs(false);
                }
              }}
              disabled={sendingRefs}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10 transition-colors disabled:opacity-60"
            >
              <UserCheck className="w-4 h-4" />
              {sendingRefs ? "Sending…" : "Reference Check"}
            </button>
            {refsMsg && (
              <span className={`text-xs ${refsMsg.type === "success" ? "text-green-600" : "text-red-600"}`}>{refsMsg.text}</span>
            )}
            <button
              onClick={() => setShowRefs(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-[#1A1A1A]/20 text-[#1A1A1A] hover:bg-[#1A1A1A]/5 transition-colors"
            >
              <Users className="w-4 h-4" />
              View References
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-400 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Applicant
            </button>
          </div>
        </CardContent>
      )}

      {showScheduler && (
        <InterviewSchedulerModal
          app={app}
          onClose={() => setShowScheduler(false)}
          onScheduled={(conference) => onUpdate(app.id, { status: "interview_invitation" })}
        />
      )}

      <DeleteApplicationDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        appName={app.full_name}
        onConfirm={confirmDelete}
        deleting={deleting}
      />

      {showRefs && (
        <ReferenceCheckModal applicationId={app.id} applicantName={app.full_name} onClose={() => setShowRefs(false)} />
      )}
    </Card>
  );
}