import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock, Play, Pause, CheckCircle2, Send, AlertTriangle, X, FileText, FolderOpen, ArrowUpRight, Cloud, Upload, ExternalLink } from "lucide-react";

const STATUS_LABELS = {
  waiting_for_upload: "Waiting for Upload",
  ready_for_editing: "Ready for Editing",
  assigned: "Assigned",
  editing: "Editing",
  submitted_for_qc: "Submitted for QC",
  revision_required: "Revision Required",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function EditingTaskDetail({ task, editors, onClose, onActionComplete }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState(task.editor_id || "");
  const [finalMediaLocation, setFinalMediaLocation] = useState(task.final_media_location || "");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [qcNotes, setQcNotes] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [correctedMinutes, setCorrectedMinutes] = useState(task.active_editing_minutes || 0);
  const [correctionReason, setCorrectionReason] = useState("");
  const [showCorrectTime, setShowCorrectTime] = useState(false);

  const callAction = async (action, extra = {}) => {
    setLoading(true);
    try {
      const salesEmail = localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
      const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
      await base44.functions.invoke("manageEditingTask", {
        action,
        task_id: task.id,
        email: salesEmail,
        sales_member_id: salesMemberId,
        ...extra,
      });
      onActionComplete();
    } catch (err) {
      alert(`Action failed: ${err.message || err.error || "Unknown error"}`);
      setLoading(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploadRes?.file_url || uploadRes?.data?.file_url;
      if (!file_url) throw new Error("Failed to get file URL from upload");

      const res = await base44.functions.invoke("uploadFinalEdit", {
        task_id: task.id,
        file_url,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
      });
      const resData = res?.data || res;
      if (!resData?.file_url) throw new Error("Google Drive upload failed");
      setFinalMediaLocation(resData.file_url);
    } catch (err) {
      alert(err.message || err.error || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleAssign = () => {
    if (!selectedEditor) return alert("Select an editor");
    callAction("assign", { editor_profile_id: selectedEditor });
  };

  const deadline = task.delivery_deadline ? new Date(task.delivery_deadline) : null;
  const hoursLeft = deadline ? Math.round((deadline.getTime() - Date.now()) / (60 * 60 * 1000)) : null;

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#B8956A]" />
            {task.task_label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Task info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Client" value={task.client_name} />
            <InfoRow label="Property" value={task.property_address} />
            <InfoRow label="Package" value={task.package_id} />
            <InfoRow label="Status" value={STATUS_LABELS[task.status]} />
            <InfoRow label="Editor" value={task.editor_name || "Unassigned"} />
            <InfoRow label="Priority" value={task.priority} />
            <InfoRow label="Active Time" value={`${task.active_editing_minutes || 0} min`} />
            <InfoRow label="Revisions" value={task.revision_count || 0} />
            {deadline && (
              <InfoRow
                label="Deadline"
                value={`${deadline.toLocaleString()} (${hoursLeft < 0 ? `${Math.abs(hoursLeft)}h over` : `${hoursLeft}h left`})`}
              />
            )}
          </div>

          {/* Source media — editor accesses raw footage through existing Google Drive */}
          {(task.storage_folder_url || task.source_media_location) && (
            <div className="rounded-lg border border-[#B8956A]/20 bg-[#FFFBF5] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-[#1A1A1A]/60 flex items-center gap-1">
                    <Cloud className="w-3 h-3" /> Source Media ({task.storage_provider || "GOOGLE_DRIVE"})
                  </Label>
                  {task.required_source_media && task.required_source_media !== "all" && (
                    <p className="text-xs text-[#B8956A] mt-0.5">
                      Required: {task.required_source_media.toUpperCase()}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(task.storage_folder_url || task.source_media_location, "_blank");
                  }}
                  className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                >
                  <FolderOpen className="w-4 h-4 mr-1" /> Open Source Footage
                </Button>
              </div>
              {task.upload_completed_at && (
                <p className="text-xs text-[#1A1A1A]/50">
                  Upload confirmed: {new Date(task.upload_completed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Parent Job link — trace back to the canonical Job record */}
          {task.job_id && (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/JobDetail?job_id=${task.job_id}`)}
                className="text-[#1A1A1A]/70 hover:text-[#B8956A]"
              >
                View Parent Job <ArrowUpRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}

          {/* Final deliverable media — distinct from source footage */}
          {task.final_media_location && (
            <div>
              <Label className="text-xs text-[#1A1A1A]/60">Final Deliverable Media</Label>
              <a
                href={task.final_media_location}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-green-700 hover:underline mt-1"
              >
                {task.final_media_location}
              </a>
            </div>
          )}

          {/* Revision reason if applicable */}
          {task.status === "revision_required" && task.revision_reason && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
              <p className="text-xs font-semibold text-orange-800 mb-1">Revision Requested:</p>
              <p className="text-sm text-orange-900">{task.revision_reason}</p>
            </div>
          )}

          {/* QC notes if applicable */}
          {task.qc_notes && task.status !== "revision_required" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-[#1A1A1A]/60 mb-1">QC Notes:</p>
              <p className="text-sm text-[#1A1A1A]/80">{task.qc_notes}</p>
            </div>
          )}

          {/* Actions based on status */}
          <div className="border-t pt-4 space-y-3">
            {/* ASSIGN: ready_for_editing or revision_required (reassign) */}
            {(task.status === "ready_for_editing" || task.status === "revision_required" || task.status === "assigned") && (
              <div className="space-y-2">
                <Label>Assign Editor</Label>
                <div className="flex gap-2">
                  <Select value={selectedEditor} onValueChange={setSelectedEditor}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select an editor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {editors
                        .filter((e) => e.editor_status === "active")
                        .map((e) => {
                          const hasCap = (task.required_editor_capabilities || []).every(
                            (c) => (e.verified_editor_capabilities || []).includes(c)
                          );
                          return (
                            <SelectItem key={e.id} value={e.id} disabled={!hasCap}>
                              {e.employee_name} {!hasCap && "(lacks capability)"}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAssign} disabled={loading || !selectedEditor}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
                  </Button>
                </div>
              </div>
            )}

            {/* EDITING actions */}
            {task.status === "assigned" && (
              <Button onClick={() => callAction("start_editing", { editor_profile_id: task.editor_id })} disabled={loading} className="w-full">
                <Play className="w-4 h-4 mr-2" /> Start Editing
              </Button>
            )}
            {task.status === "editing" && (
              <div className="flex gap-2">
                <Button onClick={() => callAction("pause_editing", { editor_profile_id: task.editor_id })} disabled={loading} variant="outline" className="flex-1">
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </Button>
              </div>
            )}

            {/* SUBMIT FOR QC */}
            {(task.status === "editing" || task.status === "revision_required") && (
              <div className="space-y-2">
                <Label>Final Deliverable Upload</Label>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,.zip,.mp4,.mov,.jpg,.jpeg,.png"
                />
                <div
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
                    dragOver
                      ? "border-[#B8956A] bg-[#B8956A]/10"
                      : "border-[#B8956A]/30 bg-[#B8956A]/5 hover:border-[#B8956A]/50 hover:bg-[#B8956A]/10"
                  } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                >
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-[#B8956A]">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Uploading to Google Drive...
                    </div>
                  ) : finalMediaLocation ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm text-[#B8956A]">
                        <CheckCircle2 className="w-5 h-5" />
                        <span className="font-medium">Final edit uploaded to Drive</span>
                      </div>
                      <a
                        href={finalMediaLocation}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-[#B8956A] hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open in Google Drive
                      </a>
                      <p className="text-xs text-[#1A1A1A]/40">Click or drop to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-6 h-6 text-[#B8956A]/50 mx-auto" />
                      <p className="text-sm font-medium text-[#1A1A1A]/70">
                        Drop final edit here or click to upload
                      </p>
                      <p className="text-xs text-[#1A1A1A]/40">
                        Uploads directly to Google Drive "Final Edits" folder
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => callAction("submit_for_qc", { editor_profile_id: task.editor_id, final_media_location: finalMediaLocation })}
                  disabled={loading || uploading || !finalMediaLocation}
                  className="w-full"
                >
                  <Send className="w-4 h-4 mr-2" /> Submit for QC
                </Button>
              </div>
            )}

            {/* QC REVIEW actions */}
            {task.status === "submitted_for_qc" && (
              <div className="space-y-3">
                <div>
                  <Label>QC Notes (approval)</Label>
                  <Textarea value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} placeholder="Approval notes..." rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => callAction("approve_qc", { qc_notes: qcNotes })} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700">
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button onClick={() => callAction("request_revision", { revision_reason: revisionReason || qcNotes })} disabled={loading} variant="outline" className="flex-1 border-orange-400 text-orange-700 hover:bg-orange-50">
                    <AlertTriangle className="w-4 h-4 mr-2" /> Request Revision
                  </Button>
                </div>
              </div>
            )}

            {/* DELIVER */}
            {task.status === "approved" && (
              <Button onClick={() => callAction("deliver")} disabled={loading} className="w-full bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Delivered to Customer
              </Button>
            )}

            {/* CANCEL */}
            {task.status !== "delivered" && task.status !== "cancelled" && (
              <div className="flex gap-2 pt-2 border-t">
                <input
                  type="text"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Cancel reason..."
                  className="flex-1 px-3 py-2 rounded-lg border border-red-200 text-sm"
                />
                <Button onClick={() => callAction("cancel", { reason: cancelReason })} disabled={loading} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                  Cancel Task
                </Button>
              </div>
            )}

            {/* TIME CORRECTION (admin) */}
            {task.active_editing_minutes > 0 && (
              <div className="pt-2 border-t">
                {!showCorrectTime ? (
                  <Button variant="ghost" size="sm" onClick={() => setShowCorrectTime(true)} className="text-xs text-[#1A1A1A]/50">
                    Correct Time Record
                  </Button>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg bg-gray-50">
                    <Label className="text-xs">Correct Active Minutes</Label>
                    <input
                      type="number"
                      value={correctedMinutes}
                      onChange={(e) => setCorrectedMinutes(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                    />
                    <input
                      type="text"
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      placeholder="Reason for correction (required)..."
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                    />
                    <Button
                      onClick={() => callAction("correct_time", { new_active_minutes: correctedMinutes, reason: correctionReason })}
                      disabled={loading || !correctionReason}
                      size="sm"
                      variant="outline"
                      className="w-full"
                    >
                      Submit Correction
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      <p className="text-sm font-medium text-[#1A1A1A]">{value || "—"}</p>
    </div>
  );
}