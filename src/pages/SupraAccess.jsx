import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, ExternalLink, Smartphone } from "lucide-react";

export default function SupraAccess() {
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    // Attempt to open Supra ekey app on mount
    openSupraApp();
  }, []);

  const openSupraApp = () => {
    setAttempted(true);
    // Try Supra ekey deep link
    window.location.href = "supra://";
    
    // Fallback to app store if app doesn't open within 2 seconds
    setTimeout(() => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      
      if (isIOS) {
        window.location.href = "https://apps.apple.com/us/app/supra-ekey/id435016938";
      } else if (isAndroid) {
        window.location.href = "https://play.google.com/store/apps/details?id=com.suprakey.android";
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-2xl mx-auto">
        <Card className="border-2 border-[#B8956A]/20">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <Key className="w-8 h-8 text-[#B8956A]" />
            </div>
            <CardTitle className="text-2xl text-[#1A1A1A]">Supra eKey Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {attempted && (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-[#1A1A1A]/60">
                  <Smartphone className="w-5 h-5" />
                  <p className="text-sm">Opening Supra eKey app...</p>
                </div>
                
                <div className="p-4 bg-[#B8956A]/5 rounded-lg">
                  <p className="text-sm text-[#1A1A1A]/70">
                    If the app doesn't open automatically, tap the button below:
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={openSupraApp}
              className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white gap-2"
            >
              <ExternalLink className="w-5 h-5" />
              Open Supra eKey App
            </Button>

            <div className="text-center text-xs text-[#1A1A1A]/50 space-y-2">
              <p>Don't have the Supra eKey app installed?</p>
              <div className="flex justify-center gap-4">
                <a 
                  href="https://apps.apple.com/us/app/supra-ekey/id435016938"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8956A] hover:underline"
                >
                  Download for iOS
                </a>
                <span className="text-[#1A1A1A]/30">•</span>
                <a 
                  href="https://play.google.com/store/apps/details?id=com.suprakey.android"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B8956A] hover:underline"
                >
                  Download for Android
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}