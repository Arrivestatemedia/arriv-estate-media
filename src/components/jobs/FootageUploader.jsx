import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, FileText, Image, Video, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB — streamed to Drive in chunks

export default function FootageUploader({ job, currentUserEmail, onAllUploaded }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [showMoreFilesPrompt, setShowMoreFilesPrompt] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState({}); // { [fileName]: percent }
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

  const initiateSession = async (file) => {
    const res = await base44.functions.invoke("initiateFootageUpload", {
      jobId: job.id,
      mediaPartnerEmail: currentUserEmail,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
    });
    const data = res.data || res;
    if (!data.sessionUri) throw new Error("No upload session returned");
    return data.sessionUri;
  };

  const uploadFileResumable = async (file) => {
    if (file.size === 0) throw new Error("File is empty");
    const sessionUri = await initiateSession(file);
    const total = file.size;
    let start = 0;

    while (start < total) {
      const end = Math.min(start + CHUNK_SIZE, total);
      const chunk = file.slice(start, end);
      const putRes = await fetch(sessionUri, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${total}`,
          "Content-Length": String(end - start),
        },
        body: chunk,
      });

      if (putRes.status === 308) {
        start = end;
        setProgress((prev) => ({ ...prev, [file.name]: Math.round((end / total) * 100) }));
      } else if (putRes.status === 200 || putRes.status === 201) {
        const fileData = await putRes.json();
        setProgress((prev) => ({ ...prev, [file.name]: 100 }));
        return {
          id: fileData.id,
          name: fileData.name,
          mimeType: fileData.mimeType,
          size: fileData.size,
          thumbnailLink: fileData.thumbnailLink,
          hasThumbnail: fileData.hasThumbnail,
          modifiedTime: fileData.modifiedTime,
          localName: file.name,
        };
      } else {
        const errText = await putRes.text().catch(() => "");
        throw new Error(`Upload failed (${putRes.status})`);
      }
    }

    throw new Error("Upload did not complete");
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    const successfullyUploaded = [];
    const failedFiles = [];

    for (const file of files) {
      try {
        const result = await uploadFileResumable(file);
        successfullyUploaded.push(result);
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        failedFiles.push(file);
        setError(`Failed to upload ${file.name}: ${err.message || "Unknown error"}`);
      }
    }

    setUploadedFiles((prev) => [...prev, ...successfullyUploaded]);
    setFiles(failedFiles);
    setProgress({});

    setUploading(false);

    if (successfullyUploaded.length > 0 && onAllUploaded) {
      onAllUploaded(successfullyUploaded);
    }

    // After a fully-successful batch, ask whether more files are coming.
    if (successfullyUploaded.length > 0 && failedFiles.length === 0 && !job.footage_uploaded) {
      setShowMoreFilesPrompt(true);
    }
  };

  const handleHaveMoreFiles = () => {
    setShowMoreFilesPrompt(false);
  };

  const handleDoneUploading = async () => {
    setConfirming(true);
    setError(null);
    try {
      await base44.functions.invoke("confirmFootageUpload", { jobId: job.id });
      setShowMoreFilesPrompt(false);
      if (onAllUploaded) onAllUploaded();
    } catch (err) {
      console.error("Confirm footage upload failed:", err);
      setError("Could not finalize the upload. Please try again.");
    } finally {
      setConfirming(false);
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
          Large videos stream in chunks — no size limit
        </p>
      </div>

      {/* Pending files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => {
            const pct = progress[file.name] ?? (uploading ? 0 : null);
            return (
              <div key={index} className="p-2 rounded-lg bg-[#B8956A]/5 border border-[#B8956A]/20">
                <div className="flex items-center gap-3">
                  {getFileIcon(file)}
                  <span className="flex-1 text-sm text-[#1A1A1A] truncate">{file.name}</span>
                  <span className="text-xs text-[#1A1A1A]/40">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                  {pct === null && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-[#1A1A1A]/40 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {pct !== null && (
                  <div className="mt-2 w-full h-1.5 rounded-full bg-[#B8956A]/15 overflow-hidden">
                    <div
                      className="h-full bg-[#B8956A] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
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

      {/* More files prompt — shown after a fully-successful batch */}
      {showMoreFilesPrompt && (
        <div className="space-y-3 p-4 rounded-lg border-2 border-[#B8956A]/30 bg-[#B8956A]/5">
          <p className="text-sm font-medium text-[#1A1A1A] text-center">
            Do you have more files to upload?
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleHaveMoreFiles}
              variant="outline"
              className="flex-1 text-sm"
            >
              Yes, add more
            </Button>
            <Button
              onClick={handleDoneUploading}
              disabled={confirming}
              className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white text-sm font-medium"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalizing...
                </>
              ) : (
                "No, I'm done"
              )}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}