import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Image, Video, FileText, Loader2, ArrowLeft, Check, CheckCheck } from "lucide-react";
import { createPageUrl } from "../utils";
import { useSearchParams } from "react-router-dom";

export default function ClientJobGallery() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("jobId");
  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const userEmail = localStorage.getItem("user_email") || sessionStorage.getItem("user_email");
    if (!userEmail) {
      window.location.replace(createPageUrl("SignIn"));
      return;
    }
    setUser({ email: userEmail });
  }, []);

  useEffect(() => {
    if (!user?.email || !jobId) return;
    loadMedia();
  }, [user?.email, jobId]);

  const loadMedia = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getJobMediaForClient", {
        jobId,
        clientEmail: user.email,
      });
      const data = res.data || res;
      setFiles(data.files || []);
      setJob(data.job || null);
    } catch (err) {
      console.error("Failed to load media:", err);
      setError(err.message || "Failed to load your media");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (fileId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.id)));
    }
  };

  const downloadFile = async (file) => {
    try {
      const res = await base44.functions.fetch("/downloadJobMedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, clientEmail: user.email, fileId: file.id }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name || "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download file");
    }
  };

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    for (const fileId of Array.from(selected)) {
      const file = files.find((f) => f.id === fileId);
      if (file) {
        await downloadFile(file);
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setDownloading(false);
    setSelected(new Set());
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  if (!user) return <div className="p-8 text-center text-[#1A1A1A]/60">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <div className="bg-[#1A1A1A] border-b border-[#B8956A]/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.history.back()}
              className="text-[#FFFBF5]/70 hover:text-[#FFFBF5] hover:bg-[#FFFBF5]/10"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
          {job && (
            <>
              <h1 className="text-3xl font-serif text-[#FFFBF5] mb-1">{job.title || "Your Media"}</h1>
              <p className="text-[#B8956A]">{job.location}</p>
              {job.date && (
                <p className="text-[#FFFBF5]/50 text-sm mt-1">
                  {new Date(job.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#B8956A] mb-4" />
            <p className="text-[#1A1A1A]/60">Loading your media...</p>
          </div>
        ) : error ? (
          <Card className="p-8 text-center border-red-200">
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={loadMedia} variant="outline" className="border-[#B8956A] text-[#B8956A]">
              Try Again
            </Button>
          </Card>
        ) : files.length === 0 ? (
          <Card className="p-12 text-center border-[#B8956A]/20">
            <Image className="w-12 h-12 text-[#B8956A]/40 mx-auto mb-4" />
            <p className="text-lg font-medium text-[#1A1A1A] mb-2">No media available yet</p>
            <p className="text-sm text-[#1A1A1A]/50">
              Your photos and videos will appear here once they've been uploaded.
              Please check back soon.
            </p>
          </Card>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-[#B8956A] hover:bg-[#B8956A]/10 transition-colors"
                >
                  {selected.size === files.length && files.length > 0 ? (
                    <CheckCheck className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {selected.size === files.length && files.length > 0 ? "Deselect All" : "Select All"}
                </button>
                <span className="text-sm text-[#1A1A1A]/50">
                  {files.length} file{files.length !== 1 ? "s" : ""}
                  {selected.size > 0 && ` · ${selected.size} selected`}
                </span>
              </div>
              {selected.size > 0 && (
                <Button
                  onClick={downloadSelected}
                  disabled={downloading}
                  className="bg-[#B8956A] hover:bg-[#A68559] text-white"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Download {selected.size} file{selected.size !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Gallery grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map((file) => {
                const isSelected = selected.has(file.id);
                return (
                  <div
                    key={file.id}
                    className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#B8956A] ring-2 ring-[#B8956A]/30"
                        : "border-[#B8956A]/20 hover:border-[#B8956A]/50"
                    }`}
                    onClick={() => toggleSelect(file.id)}
                  >
                    {/* Preview */}
                    <div className="aspect-square bg-[#1A1A1A]/5 flex items-center justify-center overflow-hidden">
                      {file.isImage && file.thumbnailLink ? (
                        <img
                          src={file.thumbnailLink}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : file.isImage ? (
                        <Image className="w-10 h-10 text-[#B8956A]/40" />
                      ) : file.isVideo ? (
                        <div className="relative">
                          <Video className="w-10 h-10 text-[#B8956A]/60" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-[#B8956A]/80 flex items-center justify-center">
                              <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <FileText className="w-10 h-10 text-[#B8956A]/40" />
                      )}
                    </div>

                    {/* File info */}
                    <div className="p-2 bg-white">
                      <p className="text-xs font-medium text-[#1A1A1A] truncate">{file.name}</p>
                      {file.size && (
                        <p className="text-xs text-[#1A1A1A]/40">{formatSize(parseInt(file.size))}</p>
                      )}
                    </div>

                    {/* Selection checkmark */}
                    {isSelected && (
                      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-[#B8956A] flex items-center justify-center shadow-md">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Download button (individual) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(file);
                      }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}