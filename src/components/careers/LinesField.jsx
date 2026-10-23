import React from "react";
import { inputStyle, labelStyle, MUTED } from "./careersStyles";

/** A labelled field whose value is a list of lines (work history, education, certifications...). */
export default function LinesField({ label, value, onChange, placeholder, helper, rows = 3 }) {
  const text = Array.isArray(value) ? value.join("\n") : value || "";

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <textarea
        style={{ ...inputStyle, resize: "vertical" }}
        rows={rows}
        placeholder={placeholder}
        value={text}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
      {helper && (
        <p className="text-xs mt-1" style={{ color: MUTED }}>
          {helper}
        </p>
      )}
    </div>
  );
}