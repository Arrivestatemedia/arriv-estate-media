import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X, CheckCircle2, ImageIcon, Video, AlertCircle, Sparkles } from "lucide-react";

export default function FinalEditsUploadModal({ task, open, onClose, onComplete }) {
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | preparing | uploading | done | error
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
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
    setStatus("preparing");
    setError(null);
    setResults([]);
    try {
      // 1. Upload each file to public storage (parallel)
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const uploadRes = await base44.integrations.Core.UploadPublicFile({ file });
          const file_url = uploadRes?.file_url || uploadRes?.data?.file_url;
          if (!file_url) throw new Error(`Failed to upload ${file.name} to storage`);
          return {
            file_url,
            file_name: file.name,
            content_type: file.type || "application/octet-stream",
          };
        })
      );

      // 2. Call the batch upload + AI rename backend
      setStatus("uploading");
      const res = await base44.functions.invoke("uploadFinalEditsBatch", {
        task_id: task.id,
        files: uploadedFiles,
      });
      const resData = res?.data || res;
      if (!resData?.success) throw new Error(resData?.error || "Batch upload failed");

      setResults(resData.results || []);
      setStatus("done");
      if (onComplete) onComplete(resData.folder_url);
    } catch (err) {
      setError(err.message || err.error || "Upload failed");
      setStatus("error");
    }
  };

  const handleClose = () => {
    if (status === "preparing" || status === "uploading") return;
    setFiles([]);
    setResults([]);
    setStatus("idle");
    setError(null);
    onClose();
  };

  const renamedCount = results.filter((r) => r.original_name !== r.new_name).length;

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
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing files for upload...
              </div>
            )}
            {status === "uploading" && (
              <div className="flex items-center gap-2 text-sm text-[#B8956A]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI is classifying images and uploading to Google Drive...
                </span>
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-2.5 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          {status === "done" ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={status !== "idle"}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={files.length === 0 || status !== "idle"}
              >
                <Upload className="w-4 h-4 mr-1" />
                Upload {files.length > 0 ? `(${files.length})` : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}