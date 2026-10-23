import React from "react";
import { ArrowUpRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { CREAM, GOLD, SERIF, TEXT_DARK } from "./careersStyles";

/** Welcome band for the personalized Careers Profile. */
export default function CareersProfileHeader({ firstName, jobTitle, missingFields = [], jobDetailsUrl }) {
  return (
    <div style={{ backgroundColor: TEXT_DARK, borderBottom: `1px solid ${GOLD}` }}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-9">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: GOLD }}>
            Arriv Estate Media · Recruiting
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ ...SERIF, color: CREAM }}>
          Welcome Back, {firstName}!
        </h1>
        <p className="text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: "rgba(255,251,245,0.78)" }}>
          We have received your résumé through Indeed and filled in your application information. Please review your
          details, make any corrections, and complete anything missing.
        </p>

        {jobTitle && (
          <p className="mt-4 text-sm font-medium" style={{ color: GOLD }}>
            {jobTitle}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={jobDetailsUrl || "/SalesGrowthAdvisor"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 hover:opacity-80"
            style={{ color: CREAM }}
          >
            View Full Position Details
            <ArrowUpRight className="w-4 h-4" />
          </a>
          <span className="text-xs" style={{ color: "rgba(255,251,245,0.5)" }}>
            Opens in a new tab. Your progress stays saved here.
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-7">
        <div
          className="flex items-start gap-3 p-4 rounded-xl"
          style={
            missingFields.length
              ? { backgroundColor: "rgba(184,149,106,0.12)", border: "1px solid rgba(184,149,106,0.4)" }
              : { backgroundColor: "rgba(255,251,245,0.06)", border: "1px solid rgba(184,149,106,0.3)" }
          }
        >
          {missingFields.length ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: GOLD }} />
          )}
          <div className="text-sm" style={{ color: "rgba(255,251,245,0.85)" }}>
            {missingFields.length ? (
              <>
                <span className="font-semibold">Still needed:</span> {missingFields.join(", ")}. Everything else was
                filled in from your résumé and can be edited below.
              </>
            ) : (
              <>
                <span className="font-semibold">Your details were filled in from your résumé.</span> Review them, answer
                the screening questions, and submit.
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}