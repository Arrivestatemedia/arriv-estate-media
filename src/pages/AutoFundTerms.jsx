import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, FileText } from "lucide-react";
import {
  AUTOFUND_TERMS_VERSION,
  AUTOFUND_TERMS_BANNER,
  AUTOFUND_TERMS_SECTIONS,
  AUTOFUND_TERMS_SUPPORT,
} from "@/lib/autofundTermsV1";

/**
 * AutoFundTerms — the complete, versioned Auto-Fund membership terms.
 *
 * This is the page the pre-authorization disclosure links to. It is provided IN
 * ADDITION to the material disclosures shown on the enrollment screen, never as
 * a substitute for them, so a recurring-billing disclosure is never link-only.
 */
export default function AutoFundTerms() {
  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/AutoFund"
          className="inline-flex items-center gap-2 text-sm text-[#1A1A1A]/60 hover:text-[#1A1A1A] mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Auto-Fund
        </Link>

        <div className="flex items-start gap-3 mb-2">
          <FileText className="w-7 h-7 text-[#B8956A] mt-1 shrink-0" />
          <div>
            <h1 className="text-3xl font-serif text-[#1A1A1A]">Auto-Fund Membership Terms</h1>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">Version {AUTOFUND_TERMS_VERSION}</p>
          </div>
        </div>

        <div className="my-6 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-900 leading-relaxed">{AUTOFUND_TERMS_BANNER}</p>
        </div>

        <div className="bg-white border border-[#B8956A]/20 rounded-xl p-6 sm:p-8 space-y-7">
          {AUTOFUND_TERMS_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-medium text-[#1A1A1A] mb-2">{section.heading}</h2>
              <div className="space-y-2">
                {section.paragraphs.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-[#1A1A1A]/75">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-lg bg-white border border-[#B8956A]/20">
          <p className="text-xs text-[#1A1A1A]/60">
            Questions about these terms:{" "}
            <a
              href={`mailto:${AUTOFUND_TERMS_SUPPORT.email}`}
              className="text-[#B8956A] hover:underline"
            >
              {AUTOFUND_TERMS_SUPPORT.email}
            </a>
            . Manage or cancel your membership from{" "}
            <a
              href={AUTOFUND_TERMS_SUPPORT.dashboard_url}
              className="text-[#B8956A] hover:underline"
            >
              your Auto-Fund dashboard
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}