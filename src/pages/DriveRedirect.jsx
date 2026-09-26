import React, { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function DriveRedirect() {
  const { fileId } = useParams();

  useEffect(() => {
    if (fileId) {
      window.location.replace(`https://drive.google.com/file/d/${fileId}/view`);
    }
  }, [fileId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#1A1A1A]/60 text-sm">Opening document…</p>
      </div>
    </div>
  );
}