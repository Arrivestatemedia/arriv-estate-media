import React from "react";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { CERTIFICATION_DOMAINS } from "@/lib/certificationRubrics";

export default function DomainStatusGrid({ domains, certifiedDomains }) {
  if (!domains) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CERTIFICATION_DOMAINS.map(domain => {
        const status = domains[domain.key] || "PENDING";
        const isCertified = (certifiedDomains || []).includes(domain.label);
        return (
          <div key={domain.key} className={`p-3 rounded-lg border ${
            status === "PASSED" ? "border-emerald-200 bg-emerald-50" :
            status === "FAILED" ? "border-red-200 bg-red-50" :
            "border-[#B8956A]/20 bg-white"
          }`}>
            <div className="flex items-start gap-2">
              {status === "PASSED" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /> :
               status === "FAILED" ? <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> :
               <Clock className="w-4 h-4 text-[#1A1A1A]/30 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1A1A1A]">{domain.label}{isCertified && <span className="ml-1 text-xs text-emerald-600">✓ CERTIFIED</span>}</p>
                <p className="text-xs text-[#1A1A1A]/50 mt-0.5">{domain.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}