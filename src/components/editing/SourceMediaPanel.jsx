import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Archive, FolderOpen, FileText, Image, Video, CheckCircle2, ExternalLink } from "lucide-react";

export default function SourceMediaPanel({ jobId, onArchived }) {
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState([]);
  const [sourceArchived, setSourceArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const salesEmail = localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
      const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
      const params = new URLSearchParams();
      if (salesEmail) params.set("email", salesEmail);
      if (salesMemberId) params.set("sales_member_id", salesMemberId);
      const qs = params.toString();
      const fnName = qs ? `getSourceMedia?${qs}` : "getSourceMedia";
      const res = await base44.functions.invoke(fnName, { jobId, email: salesEmail, sales_member_id: salesMemberId });
      const data = res?.data || res;
      setFiles(data?.files || []);
      setSourceArchived(data?.source_archived || false);
    } catch (err) {
      console.error("Failed to load source media:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) loadMedia();
  }, [jobId]);

  const handleArchive = async () => {
    if (!confirm("This will move all source files to an archive folder and clear the main folder for final edits. Continue?")) return;
    setArchiving(true);
    try {
      const salesEmail = localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
      const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
      const params = new URLSearchParams();
      if (salesEmail) params.set("email", salesEmail);
      if (salesMemberId) params.set("sales_member_id", salesMemberId);
      const qs = params.toString();
      const fnName = qs ? `archiveSourceMedia?${qs}` : "archiveSourceMedia";
      const res = await base44.functions.invoke(fnName, { jobId, email: salesEmail, sales_member_id: salesMemberId });
      const data = res?.data || res;
      if (data?.success) {
        setSourceArchived(true);
        setFiles([]);
        if (onArchived) onArchived();
      }
    } catch (err) {
      alert(err.message || "Archive failed");
    } finally {
      setArchiving(false);
    }
  };

  const downloadFile = async (file) => {
    try {
      const salesEmail = localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");
      const salesMemberId = localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
      const res = await base44.functions.fetch("/downloadJobMedia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, fileId: file.id, adminAccess: true, email: salesEmail, sales_member_id: salesMemberId }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Fallback: open Drive web content link
      if (file.webContentLink) {
        window.open(file.webContentLink, "_blank");
      } else {
        alert("Download failed");
      }
    }
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
          <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />
          Loading source media...
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#1A1A1A]/70 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-[#B8956A]" /> SOURCE MEDIA ({files.length})
        </h3>
        {sourceArchived ? (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Archived
          </Badge>
        ) : (
          files.length > 0 && (
            <Button
              size="sm"
              onClick={handleArchive}
              disabled={archiving}
              className="bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              {archiving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Archive className="w-4 h-4 mr-1" />}
              Archive Source Files
            </Button>
          )
        )}
      </div>

      {sourceArchived && files.length === 0 ? (
        <div className="text-center py-4 text-sm text-[#1A1A1A]/50">
          Source files have been archived. The main folder is ready for final edit uploads.
        </div>
      ) : files.length === 0 ? (
        <div className="text-center py-4 text-sm text-[#1A1A1A]/50">
          No source files uploaded yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((file) => (
            <div key={file.id} className="rounded-lg border border-[#B8956A]/15 overflow-hidden">
              {file.isImage && file.thumbnailLink ? (
                <img src={file.thumbnailLink} alt={file.name} className="w-full h-24 object-cover" />
              ) : file.isVideo ? (
                <div className="w-full h-24 bg-purple-50 flex items-center justify-center">
                  <Video className="w-8 h-8 text-purple-400" />
                </div>
              ) : (
                <div className="w-full h-24 bg-gray-50 flex items-center justify-center">
                  {file.isImage ? <Image className="w-8 h-8 text-gray-400" /> : <FileText className="w-8 h-8 text-gray-400" />}
                </div>
              )}
              <div className="p-2">
                <p className="text-xs font-medium text-[#1A1A1A] truncate" title={file.name}>{file.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[#1A1A1A]/40">
                    {file.size ? `${(file.size / 1024).toFixed(0)} KB` : ""}
                  </span>
                  <button
                    onClick={() => downloadFile(file)}
                    className="text-[#B8956A] hover:text-[#A68559]"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}