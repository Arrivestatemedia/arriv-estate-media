import React from "react";
import { User } from "lucide-react";
import ProfileSection from "./ProfileSection";
import Field from "./Field";

/** Contact and personal details, pre-filled from the imported résumé. */
export default function PersonalInfoFields({ fields, onChange, errors }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });

  return (
    <ProfileSection
      title="Your Details"
      subtitle="Filled in from your résumé for you to confirm. Correct anything that is not right."
      icon={User}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name" required value={fields.full_name} onChange={set("full_name")} error={errors.full_name} />
        <Field label="Email Address" type="email" required value={fields.email} onChange={set("email")} error={errors.email} />
        <Field label="Phone Number" type="tel" required value={fields.phone} onChange={set("phone")} error={errors.phone} />
        <Field
          label="Date of Birth"
          type="date"
          value={fields.dob}
          onChange={set("dob")}
          error={errors.dob}
          hint="Optional — add it only if you'd like us to have it."
        />
      </div>

      <Field
        label="Residential Address"
        required
        value={fields.address}
        onChange={set("address")}
        error={errors.address}
        placeholder="Street, city, state, ZIP"
      />

      <Field
        label="LinkedIn Profile"
        value={fields.linkedin}
        onChange={set("linkedin")}
        error={errors.linkedin}
        placeholder="linkedin.com/in/…"
        hint="Optional, but it helps us review your background."
      />
    </ProfileSection>
  );
}