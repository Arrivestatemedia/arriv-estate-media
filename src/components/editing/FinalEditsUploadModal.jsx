import React, { useState, useRef } from "react";
import { useFinalEditsUpload } from "@/components/editing/FinalEditsUploadContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X, CheckCircle2, ImageIcon, Video, AlertCircle, Sparkles } from "lucide-react";

export default function FinalEditsUploadModal({ task, open, onClose, onComplete }) {
  const { uploads, startUpload, clearUpload } = useFinalEditsUpload();
  const upload = uploads[task.id] || null;
  const status = upload?.status || "idle";

  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    const selected = files;
    setFiles([]);
    try {
      await startUpload(task, selected, onComplete);
    } catch {
      // error state is reflected in context
    }
  };

  const handleClose = () => {
    // Allow closing at any time — the upload continues in the background
    // and its status stays visible via the floating banner.
    setFiles([]);
    onClose();
  };

  const handleDismissDone = () => {
    clearUpload(task.id);
    setFiles([]);
    onClose();
  };

  const results = upload?.results || [];
  const renamedCount = results.filter((r) => r.original_name !== r.new_name).length;
  const progress = upload?.progress || { done: 0, total: 0 };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[#B8956A]" />
            Upload Final Edits
          </DialogTitle>
          <p className="text-sm text-[#1A1A1A]/60">
            {task.task_label} • {task.client_name} — {task.property_address}
          </p>
        </DialogHeader>

        {status === "done" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">
                {results.length} file{results.length !== 1 ? "s" : ""} uploaded to Google Drive
                {renamedCount > 0 && ` • ${renamedCount} auto-named by AI`}
              </span>
            </div>
            <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-[#B8956A]/5 rounded-lg border border-[#B8956A]/15">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{r.new_name}</p>
                      {r.scene_label && (
                        <Badge className="bg-[#B8956A]/15 text-[#B8956A] text-[10px] shrink-0">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          {r.scene_label}
                        </Badge>
                      )}
                    </div>
                    {r.original_name !== r.new_name && (
                      <p className="text-xs text-[#1A1A1A]/50 truncate mt-0.5">
                        was: {r.original_name}
                      </p>
                    )}
                    {r.error && (
                      <p className="text-xs text-red-500 mt-0.5">{r.error}</p>
                    )}
                  </div>
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ml-2 ${r.error ? "text-red-400" : "text-green-600"}`} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div
              onClick={() => status === "idle" && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                dragOver
                  ? "border-[#B8956A] bg-[#B8956A]/10"
                  : "border-[#B8956A]/30 bg-[#B8956A]/5 hover:border-[#B8956A]/50"
              } ${status !== "idle" ? "opacity-60 pointer-events-none" : ""}`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                multiple
                accept="image/*,video/*,.jpg,.jpeg,.png,.webp,.mp4,.mov,.heic"
              />
              <Upload className="w-8 h-8 text-[#B8956A]/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-[#1A1A1A]/70">
                Drop final edits here or click to select
              </p>
              <p className="text-xs text-[#1A1A1A]/40 mt-1">
                Multiple files supported • Images auto-named by AI (e.g. "Bedroom", "Kitchen")
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-white border border-[#B8956A]/20 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {file.type.startsWith("image/") ? (
                        <ImageIcon className="w-4 h-4 text-[#B8956A] shrink-0" />
                      ) : (
                        <Video className="w-4 h-4 text-[#B8956A] shrink-0" />
                      )}
                      <span className="text-sm text-[#1A1A1A] truncate">{file.name}</span>
                      <span className="text-xs text-[#1A1A1A]/40 shrink-0">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    </div>
                    {status === "idle" && (
                      <button
                        onClick={() => removeFile(idx)}
                        className="text-[#1A1A1A]/40 hover:text-red-500 shrink-0 ml-2 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {status === "preparing" && (
              <div className="flex items-center gap-2 text-sm text-[#B8956A]">
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading to storage... {progress.done}/{progress.total}
                {progress.total > 0 && (
                  <span className="flex-1 h-1.5 bg-[#B8956A]/15 rounded-full overflow-hidden ml-2">
                    <span
                      className="block h-full bg-[#B8956A] transition-all duration-200"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </span>
                )}
              </div>
            )}
            {status === "uploading" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-[#B8956A]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI is classifying images and uploading to Google Drive...
                  </span>
                </div>
                <div className="h-1.5 bg-[#B8956A]/15 rounded-full overflow-hidden">
                  <span className="block h-full w-1/3 bg-[#B8956A] rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                </div>
                <p className="text-xs text-[#1A1A1A]/40">
                  Classifying scenes in batches of 10, then uploading each file to Drive. This can take a minute for large batches.
                </p>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{upload?.error}</span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {status === "done" ? (
            <Button onClick={handleDismissDone}>Done</Button>
          ) : status === "idle" ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={files.length === 0}
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload {files.length > 0 ? `(${files.length})` : ""}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Close — upload continues in background
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}