import React from "react";
import SignaturePad from "@/components/sign/SignaturePad";

// A field rendered inline inside an editor (rich-text) document.
export default function InlineEditorField({ field, value, missing, onChange }) {
  const isSig = field.type === "signature" || field.type === "initial";
  const border = missing ? "border-red-400" : isSig ? "border-amber-400" : "border-blue-400";

  return (
    <span className="inline-flex flex-col align-middle mx-1 my-1" style={{ colorScheme: "light" }}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 leading-none">
        {field.label}{field.required !== false && " *"}
      </span>
      {isSig ? (
        <span className={`block w-64 h-20 border-2 border-dashed ${border} rounded-lg overflow-hidden`}>
          <SignaturePad
            value={value}
            onChange={onChange}
            placeholder={field.type === "initial" ? "Draw your initials" : "Draw your signature"}
          />
        </span>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.label}
          className={`min-w-[160px] px-2 py-1 border-2 ${border} rounded text-sm bg-white outline-none focus:border-blue-500`}
          style={{ color: "#0F172A" }}
        />
      )}
    </span>
  );
}