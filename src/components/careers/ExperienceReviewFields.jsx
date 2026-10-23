import React from "react";
import { AlertCircle, Briefcase } from "lucide-react";
import ProfileSection from "./ProfileSection";
import LinesField from "./LinesField";
import { GOLD, inputStyle, labelStyle, MUTED } from "./careersStyles";

/** Experience, education and skills read from the résumé, for the applicant to confirm. */
export default function ExperienceReviewFields({ experience, onChange }) {
  const set = (patch) => onChange({ ...experience, ...patch });
  const uncertain = experience.uncertain_fields || [];

  return (
    <ProfileSection
      title="Experience From Your Résumé"
      subtitle="We read this from your résumé. Edit anything that needs correcting."
      icon={Briefcase}
    >
      {uncertain.length > 0 && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.35)", color: "rgba(26,26,26,0.8)" }}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: GOLD }} />
          <span>Please double-check: {uncertain.join(", ")}.</span>
        </div>
      )}

      <div>
        <label style={labelStyle}>Professional Summary</label>
        <textarea
          rows={3}
          value={experience.summary || ""}
          onChange={(e) => set({ summary: e.target.value })}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="A short summary of your background"
        />
      </div>

      <LinesField
        label="Work History"
        value={experience.work_history}
        onChange={(lines) => set({ work_history: lines })}
        rows={4}
        helper="One role per line — company, title, dates."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LinesField
          label="Education"
          value={experience.education}
          onChange={(lines) => set({ education: lines })}
          rows={3}
        />
        <LinesField
          label="Certifications"
          value={experience.certifications}
          onChange={(lines) => set({ certifications: lines })}
          rows={3}
        />
      </div>

      <LinesField
        label="Skills"
        value={experience.skills}
        onChange={(lines) => set({ skills: lines })}
        rows={2}
        helper="One skill per line."
      />
      <p className="text-xs" style={{ color: MUTED }}>
        Nothing here is invented — anything we could not read from your résumé is simply left empty for you to add.
      </p>
    </ProfileSection>
  );
}