import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, ExternalLink, Smartphone } from "lucide-react";

export default function SupraAccess() {
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
            <div className="text-center text-[#1A1A1A]/70">
              <p className="text-sm mb-4">Download the Supra eKey app to access your keys</p>
            </div>

            <div className="flex flex-col gap-3">
              <a 
                href="https://apps.apple.com/us/app/supra-ekey/id379909266"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                Download for iOS
              </a>
              <a 
                href="https://play.google.com/store/apps/details?id=com.utc.fs.ekey&hl=en_IN"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <ExternalLink className="w-5 h-5" />
                Download for Android
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}