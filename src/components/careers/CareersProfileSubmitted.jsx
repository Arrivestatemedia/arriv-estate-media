import React from "react";
import { CheckCircle2 } from "lucide-react";
import { CREAM, GOLD, MUTED, SERIF, TEXT_DARK } from "./careersStyles";

/** Confirmation shown after the Careers Profile is submitted. */
export default function CareersProfileSubmitted({ firstName }) {
  return (
    <div style={{ backgroundColor: CREAM, minHeight: "100vh" }}>
      <div style={{ backgroundColor: TEXT_DARK, borderBottom: `1px solid ${GOLD}` }} className="px-5 py-8">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GOLD }} />
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase" style={{ color: GOLD }}>
            Arriv Estate Media · Recruiting
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-12 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto mb-5" style={{ color: GOLD }} />
        <h1 className="text-3xl font-bold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>
          Thank You, {firstName}!
        </h1>
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: MUTED }}>
          Your Careers Profile is complete and has been added to your application. Our recruiting team will review it
          and reach out if there is a match. There is nothing further you need to do right now.
        </p>
      </div>
    </div>
  );
}