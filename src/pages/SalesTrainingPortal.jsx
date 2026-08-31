import React from "react";
import SalesTrainingContent from "@/components/sales/SalesTrainingContent";

export default function SalesTrainingPortal() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Sales Training Portal</h1>
          <p className="text-slate-600">Complete your training modules and earn your certification</p>
        </div>
        <SalesTrainingContent />
      </div>
    </div>
  );
}