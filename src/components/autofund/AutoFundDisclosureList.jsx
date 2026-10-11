import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, FileText } from "lucide-react";

/**
 * AutoFundDisclosureList — the pre-authorization disclosure.
 *
 * Renders EVERY material recurring-billing disclosure item IN TEXT from the
 * authoritative package the backend returns. The complete versioned terms are
 * linked in ADDITION to these statements, never instead of them, so no material
 * recurring-billing disclosure is delivered as a link the customer must go and read.
 *
 * The same component and the same payload serve self-service and sales-assisted
 * enrollment, so the two channels cannot diverge.
 */
export default function AutoFundDisclosureList({ disclosure }) {
  if (!disclosure) return null;

  const items = disclosure.material_items || [];

  return (
    <div className="rounded-lg border border-[#B8956A]/25 bg-[#FFFBF5] divide-y divide-[#B8956A]/15">
      <div className="px-4 py-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#B8956A] shrink-0" />
        <p className="text-xs font-medium text-[#1A1A1A]">
          Before you authorize, here is exactly what you are agreeing to
        </p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {items.map((item) => (
          <div key={item.key}>
            <p className="text-xs font-medium text-[#1A1A1A]">{item.label}</p>
            <p className="text-xs leading-relaxed text-[#1A1A1A]/70 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 space-y-2">
        <Link
          to={disclosure.terms_path || "/AutoFundTerms"}
          className="inline-flex items-center gap-1.5 text-xs text-[#B8956A] hover:underline"
        >
          <FileText className="w-3.5 h-3.5" />
          Read the complete membership terms (version {disclosure.terms_version})
        </Link>
        <p className="text-[11px] leading-relaxed text-[#1A1A1A]/50">
          The statements above are complete on their own and are not replaced by that link. Support:{" "}
          {disclosure.support_email}
        </p>
      </div>

      {disclosure.fee_refund_policy_approved === false && (
        <div className="px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-900">
            The membership-fee refund policy is still under legal review and has not been finalised. The terms you
            would be accepting are therefore not yet operative, which is why Auto-Fund enrollment is currently closed.
          </p>
        </div>
      )}

      {disclosure.wallet_terms_status === "pending_legal_review" && (
        <div className="px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-relaxed text-amber-900">
            The separate wallet refund and unused-balance terms are also still under legal review. Only the wallet
            behaviour we can verify today is stated above.
          </p>
        </div>
      )}
    </div>
  );
}