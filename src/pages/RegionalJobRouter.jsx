import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, MapPin } from "lucide-react";

export default function RegionalJobRouter() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let route = "/MediaSpecialist";
      try {
        const res = await base44.functions.invoke("resolveRegionalJob", {});
        const data = res?.data || res;
        if (data?.route) route = data.route;
      } catch (_e) {
        if (mounted) setFailed(true);
      }
      if (!mounted) return;
      // Brief beat so the loading state is visible on fast networks.
      setTimeout(() => navigate(route, { replace: true }), failed ? 1200 : 350);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate, failed]);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[#B8956A]/10 flex items-center justify-center mb-5">
          <MapPin className="w-7 h-7 text-[#B8956A]" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A] mb-3" />
        <p className="text-[#1A1A1A] font-medium text-base mb-1">
          {failed ? "Redirecting you to our careers page…" : "Finding the right opportunity for your area…"}
        </p>
        <p className="text-[#1A1A1A]/50 text-sm">
          Detecting your region to show nearby Media Specialist roles.
        </p>
      </div>
    </div>
  );
}