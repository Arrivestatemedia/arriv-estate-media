import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { base44 } from "@/api/base44Client";
import { Camera, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

function getCroppedImg(imageSrc, pixelCrop) {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0,
        pixelCrop.width, pixelCrop.height
      );
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
    };
  });
}

export default function ProfilePictureUpload({ salesMemberId, currentUrl, onUploaded }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    setUploading(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.SalesTeamMember.update(salesMemberId, { profile_picture_url: file_url });
      onUploaded(file_url);
      setImageSrc(null);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <label className="relative cursor-pointer group inline-block">
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#B8956A] bg-gray-100 flex items-center justify-center">
          {currentUrl ? (
            <img src={currentUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#B8956A]/20 text-[#B8956A] text-2xl font-bold">?</div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <Camera className="w-5 h-5 text-white" />
          </div>
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </label>

      {/* Crop Modal */}
      {imageSrc && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="relative flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="bg-black px-6 py-4 flex flex-col gap-3 items-center">
            <div className="flex items-center gap-3 w-full max-w-sm">
              <span className="text-white text-sm w-12">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-[#B8956A]"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2 text-white border-white/30 bg-transparent hover:bg-white/10" onClick={() => setImageSrc(null)}>
                <X className="w-4 h-4" /> Cancel
              </Button>
              <Button className="gap-2 bg-[#B8956A] text-black hover:bg-[#A68559]" onClick={handleConfirm} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {uploading ? "Uploading..." : "Apply"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}