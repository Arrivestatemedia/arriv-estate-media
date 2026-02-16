import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function AttireVerificationDialog({ open, onOpenChange, jobId, onVerified }) {
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [error, setError] = useState(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target.result);
      };
      reader.readAsDataURL(file);
      setError(null);
      setVerificationResult(null);
    }
  };

  const handleVerifyAttire = async () => {
    if (!photo) {
      setError("Please upload a photo first");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Upload the file
      const uploadResult = await base44.integrations.Core.UploadFile({ file: photo });
      const fileUrl = uploadResult.file_url;

      // Verify attire using AI
      const verifyResult = await base44.functions.invoke('verifyAttire', {
        jobId,
        photoUrl: fileUrl
      });

      if (verifyResult.data.verified) {
        setVerificationResult({ success: true });
        // Call onVerified after a short delay to show success message
        setTimeout(() => {
          onVerified();
        }, 1500);
      } else {
        setVerificationResult({ 
          success: false, 
          message: verifyResult.data.message || 'Please ensure you are wearing ARRIV-branded attire with the logo visible on the left chest.'
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to verify attire. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      // Only allow closing if verified
      if (!newOpen && verificationResult?.success) {
        onOpenChange(false);
      }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A]">ARRIV-Branded Attire Required</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/70">
            Property access details will be released once your attire is verified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              Please wear either:
            </p>
            <ul className="text-sm text-blue-900 mt-2 ml-2 space-y-1">
              <li>• ARRIV cream shirt with logo on left</li>
              <li>• ARRIV black jacket with logo on left + khaki pants</li>
            </ul>
          </div>

          {!photoPreview ? (
            <label className="border-2 border-dashed border-[#B8956A]/30 rounded-lg p-6 text-center cursor-pointer hover:border-[#B8956A] transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-[#B8956A] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#1A1A1A]">Upload Outfit Photo</p>
              <p className="text-xs text-[#1A1A1A]/50 mt-1">Click to select a photo</p>
            </label>
          ) : (
            <div className="space-y-3">
              <img
                src={photoPreview}
                alt="Outfit preview"
                className="w-full rounded-lg border border-[#B8956A]/20 max-h-64 object-cover"
              />
              <label className="block">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoPreview(null);
                    setVerificationResult(null);
                  }}
                >
                  Change Photo
                </Button>
              </label>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {verificationResult?.success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">Attire verified! You can now proceed.</p>
            </div>
          )}

          {verificationResult?.success === false && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-sm text-orange-900">{verificationResult.message}</p>
            </div>
          )}

          <Button
            onClick={handleVerifyAttire}
            disabled={!photoPreview || loading || verificationResult?.success}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white disabled:bg-[#B8956A]/50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : verificationResult?.success ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Verified
              </>
            ) : (
              "Verify Attire"
            )}
          </Button>

          {verificationResult?.success && (
            <p className="text-xs text-[#1A1A1A]/50 text-center">
              Dialog will close automatically...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}