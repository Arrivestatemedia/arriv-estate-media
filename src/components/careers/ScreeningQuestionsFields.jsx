import React from "react";
import { PenLine } from "lucide-react";
import ProfileSection from "./ProfileSection";
import Field from "./Field";
import { inputStyle, labelStyle } from "./careersStyles";

const RACE_OPTIONS = [
  { value: "white", label: "White" },
  { value: "black_african_american", label: "Black or African American" },
  { value: "hispanic_latino", label: "Hispanic or Latino" },
  { value: "asian", label: "Asian" },
  { value: "native_american", label: "American Indian or Alaska Native" },
  { value: "pacific_islander", label: "Native Hawaiian or Pacific Islander" },
  { value: "two_or_more", label: "Two or more races" },
  { value: "prefer_not_to_answer", label: "Prefer not to answer" },
];

const EEOC_NOTICE =
  "Arriv Estate Media is an Equal Opportunity Employer. All qualified applicants are considered without regard to race, color, religion, sex, national origin, disability, or veteran status. The information below is voluntary and is never used in hiring decisions, never shared with clients, and never synced to other systems.";

/** Screening questions, the voluntary EEOC selection and the electronic signature. */
export default function ScreeningQuestionsFields({ values, onChange, errors }) {
  const set = (patch) => onChange({ ...values, ...patch });

  return (
    <>
      <ProfileSection title="Screening Questions" subtitle="Two quick questions before you submit." icon={PenLine}>
        <div>
          <label style={labelStyle}>
            Most Recent Related Job or Experience <span style={{ color: "#B8956A" }}>*</span>
          </label>
          <textarea
            rows={3}
            value={values.last_related_job || ""}
            onChange={(e) => set({ last_related_job: e.target.value })}
            style={{ ...inputStyle, resize: "vertical", borderColor: errors.last_related_job ? "#dc2626" : "rgba(184,149,106,0.3)" }}
            placeholder="e.g. Real estate photographer, 2 years"
          />
          {errors.last_related_job && <p className="text-xs mt-1 text-red-600">{errors.last_related_job}</p>}
        </div>

        <div>
          <label style={labelStyle}>
            Why are you a good fit for this role? <span style={{ color: "#B8956A" }}>*</span>
          </label>
          <textarea
            rows={4}
            value={values.why_good_fit || ""}
            onChange={(e) => set({ why_good_fit: e.target.value })}
            style={{ ...inputStyle, resize: "vertical", borderColor: errors.why_good_fit ? "#dc2626" : "rgba(184,149,106,0.3)" }}
            placeholder="Tell us what makes you the right person for this position"
          />
          {errors.why_good_fit && <p className="text-xs mt-1 text-red-600">{errors.why_good_fit}</p>}
        </div>
      </ProfileSection>

      <ProfileSection title="Voluntary Equal Opportunity Information">
        <div>
          <label style={labelStyle}>Race / Ethnicity (optional)</label>
          <select
            value={values.race || ""}
            onChange={(e) => set({ race: e.target.value })}
            style={inputStyle}
          >
            <option value="">Select…</option>
            {RACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-3 text-sm" style={{ color: "rgba(26,26,26,0.8)" }}>
          <input
            type="checkbox"
            checked={!!values.eeoc_agreed}
            onChange={(e) => set({ eeoc_agreed: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-[#B8956A] shrink-0"
          />
          <span>{EEOC_NOTICE}</span>
        </label>
        {errors.eeoc_agreed && <p className="text-xs text-red-600">{errors.eeoc_agreed}</p>}
      </ProfileSection>

      <ProfileSection title="Electronic Signature" subtitle="Typing your full legal name acts as your signature.">
        <Field
          label="Signature"
          required
          value={values.signature}
          onChange={(e) => set({ signature: e.target.value })}
          error={errors.signature}
          placeholder="Type your full legal name"
        />
        <p className="text-xs" style={{ color: "rgba(26,26,26,0.62)" }}>
          By signing you confirm that the information in this Careers Profile is accurate and complete. Your signature
          and the voluntary information above are never shared with clients.
        </p>
      </ProfileSection>
    </>
  );
}