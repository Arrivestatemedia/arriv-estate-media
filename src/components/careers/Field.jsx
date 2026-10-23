import React from "react";
import { inputStyle, labelStyle, MUTED } from "./careersStyles";

/** One labelled input in the Careers Profile. */
export default function Field({ label, required, value, onChange, error, hint, type = "text", placeholder }) {
  return (
    <div>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: "#B8956A" }}>*</span>}
      </label>
      <input
        type={type}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        style={{ ...inputStyle, borderColor: error ? "#dc2626" : "rgba(184,149,106,0.3)" }}
      />
      {error ? (
        <p className="text-xs mt-1 text-red-600">{error}</p>
      ) : (
        hint && (
          <p className="text-xs mt-1" style={{ color: MUTED }}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}