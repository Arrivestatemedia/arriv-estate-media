import React from "react";
import SignaturePad from "@/components/sign/SignaturePad";

// Bottom-sheet editor used on phones, and for signatures on every device.
export default function FieldEditorSheet({ field, value, onChange, onClose, onNext }) {
  const isSig = field.type === "signature" || field.type === "initial";
  const advance = () => (onNext ? onNext() : onClose());

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] bg-white rounded-t-2xl border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] p-4"
      style={{ colorScheme: "light", color: "#0F172A", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-xl mx-auto">
        <p className="text-sm font-semibold mb-2">
          {field.label}{field.required !== false && <span className="text-red-500"> *</span>}
        </p>
        {isSig ? (
          <div className="h-36 border-2 border-dashed border-slate-300 rounded-lg overflow-hidden">
            <SignaturePad
              key={field.field_id}
              value={value}
              onChange={onChange}
              placeholder={field.type === "initial" ? "Draw your initials" : "Draw your signature"}
            />
          </div>
        ) : (
          <input
            key={field.field_id}
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); advance(); } }}
            enterKeyHint={onNext ? "next" : "done"}
            placeholder={field.label}
            className="w-full h-12 px-3 text-base rounded-lg border-2 border-blue-500 outline-none bg-white"
            style={{ color: "#0F172A" }}
          />
        )}
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-lg border border-slate-300 text-sm font-medium bg-white">
            Done
          </button>
          {onNext && (
            <button type="button" onClick={onNext} className="flex-1 h-11 rounded-lg bg-[#B8956A] text-white text-sm font-medium">
              Next field
            </button>
          )}
        </div>
      </div>
    </div>
  );
}