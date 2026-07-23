import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { APPLICATION_STATUSES, getStatusLabel, getStatusColor } from "@/lib/applicationStatus";
import { ChevronDown, ChevronRight, MessageSquarePlus, Trash2, Mail, Phone, MapPin, Eye } from "lucide-react";
import moment from "moment";

export default function AdminApplicationRow({ app, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [newUpdate, setNewUpdate] = useState("");
  const [docNote, setDocNote] = useState(app.documents_requested_note || "");
  const [posting, setPosting] = useState(false);

  const setStatus = (status) => onUpdate(app.id, { status });

  const addUpdate = async () => {
    if (!newUpdate.trim()) return;
    setPosting(true);
    try {
      const updates = [...(app.updates || []), { message: newUpdate.trim(), created_at: new Date().toISOString() }];
      await onUpdate(app.id, { updates });
      setNewUpdate("");
    } finally {
      setPosting(false);
    }
  };

  const removeUpdate = async (idx) => {
    const updates = (app.updates || []).filter((_, i) => i !== idx);
    await onUpdate(app.id, { updates });
  };

  const toggleDocsRequested = async (checked) => {
    await onUpdate(app.id, {
      documents_requested: checked,
      documents_requested_note: checked ? docNote : "",
    });
  };

  const saveDocNote = async () => {
    await onUpdate(app.id, { documents_requested_note: docNote });
  };

  const updates = (app.updates || []).slice().reverse();

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
            {app.portal_viewed_at ? (
              <div className="flex items-center gap-1 text-xs text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-1 rounded-full">
                <Eye className="w-3 h-3" />
                Viewed {moment(app.portal_viewed_at).fromNow()}
                {app.portal_view_count > 1 && <span className="opacity-70">· {app.portal_view_count}×</span>}
              </div>
            ) : (
              <div className="text-xs text-[var(--text-secondary)] bg-[var(--text-secondary)]/10 px-2 py-1 rounded-full">
                Not viewed
              </div>
            )}
          </div>
          <span
            className="px-3 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: getStatusColor(app.status) }}
          >
            {getStatusLabel(app.status)}
          </span>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          {/* Status control */}
          <div className="space-y-2">
            <Label className="text-[var(--text-primary)] font-semibold">Status</Label>
            <div className="flex flex-wrap gap-2">
              {APPLICATION_STATUSES.map((s) => (
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
            <p className="font-medium text-[var(--text-primary)] mt-2">Portfolio</p>
            <a href={app.portfolio_link} target="_blank" rel="noreferrer" className="text-[var(--accent-color)] underline break-all">{app.portfolio_link}</a>
            <p className="font-medium text-[var(--text-primary)] mt-2">Last Related Job / Experience</p>
            <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{app.last_related_job}</p>
            <p className="font-medium text-[var(--text-primary)] mt-2">Why a Good Fit</p>
            <p className="text-[var(--text-secondary)] whitespace-pre-wrap">{app.why_good_fit}</p>
          </div>

          {/* Samples */}
          {((app.video_samples && app.video_samples.length) || (app.picture_samples && app.picture_samples.length) || (app.documents && app.documents.length)) > 0 && (
            <div className="border-t border-[var(--border-color)] pt-3 space-y-2 text-sm">
              {app.video_samples?.length > 0 && (
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Video Samples</p>
                  {app.video_samples.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="block text-[var(--accent-color)] underline truncate">{u}</a>)}
                </div>
              )}
              {app.picture_samples?.length > 0 && (
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Picture Samples</p>
                  {app.picture_samples.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="block text-[var(--accent-color)] underline truncate">{u}</a>)}
                </div>
              )}
              {app.documents?.length > 0 && (
                <div>
                  <p className="font-medium text-[var(--text-primary)]">Documents</p>
                  {app.documents.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="block text-[var(--accent-color)] underline truncate">{u}</a>)}
                </div>
              )}
            </div>
          )}

          {/* Request documents */}
          <div className="border-t border-[var(--border-color)] pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={!!app.documents_requested}
                onCheckedChange={toggleDocsRequested}
                id={`docs-req-${app.id}`}
              />
              <Label htmlFor={`docs-req-${app.id}`} className="text-[var(--text-primary)] cursor-pointer">
                Request additional documents from applicant
              </Label>
            </div>
            {app.documents_requested && (
              <div className="flex gap-2">
                <Input
                  value={docNote}
                  onChange={(e) => setDocNote(e.target.value)}
                  placeholder="Describe what documents are needed"
                />
                <Button variant="outline" onClick={saveDocNote} className="border-[var(--accent-color)] text-[var(--accent-color)]">
                  Save Note
                </Button>
              </div>
            )}
          </div>

          {/* Updates */}
          <div className="border-t border-[var(--border-color)] pt-3 space-y-3">
            <Label className="text-[var(--text-primary)] font-semibold">Post an Update to Applicant</Label>
            <div className="flex gap-2">
              <Textarea
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="e.g. We've begun reviewing your portfolio..."
                rows={2}
              />
            </div>
            <Button onClick={addUpdate} disabled={posting || !newUpdate.trim()} size="sm" className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white">
              <MessageSquarePlus className="w-4 h-4 mr-1" /> Add Update
            </Button>

            {updates.length > 0 && (
              <ul className="space-y-2 mt-2">
                {updates.map((u, idx) => (
                  <li key={idx} className="flex items-start gap-2 bg-[var(--bg-secondary)] p-2 rounded">
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{u.message}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{moment(u.created_at).format("MMM D, YYYY h:mm A")}</p>
                    </div>
                    <button onClick={() => removeUpdate((app.updates || []).length - 1 - idx)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}