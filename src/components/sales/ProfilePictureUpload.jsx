import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Loader2 } from "lucide-react";

export default function ProfilePictureUpload({ salesMemberId, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.SalesTeamMember.update(salesMemberId, { profile_picture_url: file_url });
      onUploaded(file_url);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <label className="relative cursor-pointer group inline-block">
      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#B8956A] bg-gray-100 flex items-center justify-center">
        {currentUrl ? (
          <img src={currentUrl} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#B8956A]/20 text-[#B8956A] text-2xl font-bold">
            ?
          </div>
        )}
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          {uploading ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </div>
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
    </label>
  );
}