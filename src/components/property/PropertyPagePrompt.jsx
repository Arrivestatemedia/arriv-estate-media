import React from "react";
import { Link } from "react-router-dom";
import { Home, Sparkles } from "lucide-react";

// The opt-in entry point on the existing delivery gallery. It changes nothing about the
// download experience: a customer can ignore it entirely.
export default function PropertyPagePrompt({ jobId }) {
  if (!jobId) return null;
  return (
    <div className="mb-8 rounded-2xl border border-[#B8956A]/30 bg-white/5 p-5 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-[#B8956A]/15 border border-[#B8956A]/30 flex items-center justify-center shrink-0">
        <Home className="w-5 h-5 text-[#B8956A]" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#B8956A]">Optional</span>
          <Sparkles className="w-3 h-3 text-[#B8956A]/70" />
        </div>
        <h3 className="text-base font-medium text-white">Create Your Free Property Page</h3>
        <p className="text-sm text-white/50 leading-relaxed">
          Turn this delivered media into a property page. Your download experience stays exactly the same.
        </p>
      </div>
      <Link
        to={`/PropertyPageBuilder?jobId=${jobId}`}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#B8956A] to-[#8a6d4a] text-[#0a0b0f] text-sm font-semibold shrink-0"
      >
        Create Your Free Property Page
      </Link>
    </div>
  );
}