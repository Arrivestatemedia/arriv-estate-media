import React from "react";

// Full-page status card for the signing page (signed, declined, error, ...).
export default function SignStatusScreen({ icon: Icon, iconClass = "text-[#B8956A]", iconBg = "bg-[#B8956A]/10", title, children }) {
  return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
        <div className={`w-16 h-16 rounded-full ${iconBg} flex items-center justify-center mx-auto mb-4`}>
          <Icon className={`w-8 h-8 ${iconClass}`} />
        </div>
        <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">{title}</h1>
        <div className="text-sm text-slate-500">{children}</div>
      </div>
    </div>
  );
}