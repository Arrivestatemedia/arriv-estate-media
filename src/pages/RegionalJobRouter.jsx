import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, TrendingUp } from "lucide-react";

// /join routes visitors to the Sales Growth Advisor careers page.
export default function RegionalJobRouter() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/SalesGrowthAdvisor", { replace: true }), 400);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#FFFBF5] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[#B8956A]/10 flex items-center justify-center mb-5">
          <TrendingUp className="w-7 h-7 text-[#B8956A]" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A] mb-3" />
        <p className="text-[#1A1A1A] font-medium text-base mb-1">
          Taking you to the Sales Growth Advisor role…
        </p>
        <p className="text-[#1A1A1A]/50 text-sm">One moment while we load the page.</p>
      </div>
    </div>
  );
}