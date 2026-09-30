import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, CheckCircle2, FileText, Image, Video, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function FootageUploader({ job, currentUserEmail, onAllUploaded }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFiles) => {
    const fileArray = Array.from(selectedFiles);
    setFiles((prev) => [...prev, ...fileArray]);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("jobId", job.id);
    formData.append("mediaPartnerEmail", currentUserEmail);

    const res = await base44.functions.invoke("uploadFootageToJobDrive", formData);
    return res.data || res;
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const successfullyUploaded = [];
    const failedFiles = [];

    for (const file of files) {
      try {
        const result = await uploadFile(file);
        successfullyUploaded.push({ ...result.file, localName: file.name });
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        failedFiles.push(file);
        setError(`Failed to upload ${file.name}: ${err.message || "Unknown error"}`);
      }
    }

    setUploadedFiles((prev) => [...prev, ...successfullyUploaded]);
    // Keep failed files in the list so the partner can retry them
    setFiles(failedFiles);

    // Files landed in the job's Drive folder: auto-confirm the upload (no manual button).
    // Only when every file in the batch succeeded, so partial uploads are never marked complete.
    if (successfullyUploaded.length > 0 && failedFiles.length === 0 && !job.footage_uploaded) {
      try {
        await base44.functions.invoke("confirmFootageUpload", { jobId: job.id });
      } catch (err) {
        console.error("Auto-confirm footage upload failed:", err);
        setError("Files uploaded, but we could not finalize the upload. Please try again.");
      }
    }
    setUploading(false);

    if (successfullyUploaded.length > 0 && onAllUploaded) {
      onAllUploaded(successfullyUploaded);
    }
  };

  const getFileIcon = (file) => {
    if (file.type?.startsWith("image/")) return <Image className="w-4 h-4 text-[#B8956A]" />;
    if (file.type?.startsWith("video/")) return <Video className="w-4 h-4 text-[#B8956A]" />;
    return <FileText className="w-4 h-4 text-[#B8956A]" />;
  };

  return (
    <div className="space-y-3">
      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-[#B8956A] bg-[#B8956A]/5"
            : "border-[#B8956A]/30 hover:border-[#B8956A]/50 hover:bg-[#B8956A]/5"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <Upload className="w-8 h-8 text-[#B8956A] mx-auto mb-2" />
        <p className="text-sm font-medium text-[#1A1A1A]">
          Click to select or drag & drop your photos and videos
        </p>
        <p className="text-xs text-[#1A1A1A]/50 mt-1">
          Your files will be uploaded directly to the job folder
        </p>
      </div>

      {/* Pending files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/20">
              {getFileIcon(file)}
              <span className="flex-1 text-sm text-[#1A1A1A] truncate">{file.name}</span>
              <span className="text-xs text-[#1A1A1A]/40">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
              <button
                onClick={() => removeFile(index)}
                className="text-[#1A1A1A]/40 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white text-sm font-medium"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading {files.length} file(s)...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {files.length} file(s)
              </>
            )}
          </Button>
        </div>
      )}

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#1A1A1A]/60">
            Uploaded ({uploadedFiles.length})
          </p>
          {uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="flex-1 text-sm text-[#1A1A1A] truncate">{file.name || file.localName}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}