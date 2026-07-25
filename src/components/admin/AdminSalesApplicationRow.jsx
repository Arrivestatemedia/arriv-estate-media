import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SALES_STATUSES, getStatusLabel, getStatusColor, POSITION_LABELS } from "@/lib/applicationStatus";
import { ChevronDown, ChevronRight, Mail, Phone, MapPin, Briefcase, CalendarPlus, Trash2 } from "lucide-react";
import moment from "moment";
import InterviewSchedulerModal from "./InterviewSchedulerModal";
import DeleteApplicationDialog from "./DeleteApplicationDialog";

export default function AdminSalesApplicationRow({ app, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isSales = (app.position || "media_specialist") === "sales_growth_advisor";
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
    </Card>
  );
}