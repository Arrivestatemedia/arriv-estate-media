import React, { useRef, useEffect } from "react";

const INK = "#0F172A";

// One signing field drawn exactly over its spot on the PDF page. The box IS
// the field. Colors are forced so text stays visible in phone dark mode.
export default function SignField({ field, value, active, missing, useSheet, fontSize, onActivate, onChange }) {
  const inputRef = useRef(null);
  const isStatic = !!field.static_value;
  const isSig = field.type === "signature" || field.type === "initial";

  useEffect(() => {
    if (active && !useSheet) inputRef.current?.focus();
  }, [active, useSheet]);

  const borderColor = active ? "#3B82F6" : missing ? "#EF4444" : isStatic ? "#94A3B8" : isSig ? "#F59E0B" : "#3B82F6";
  const grow = !isStatic && !isSig && !!value;
  const style = {
    left: `${field.x}%`,
    top: `${field.y}%`,
    height: `${field.height_pct || 2}%`,
    width: grow ? "max-content" : `${field.width}%`,
    minWidth: `${field.width}%`,
    borderColor,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
    color: INK,
    colorScheme: "light",
    fontSize,
  };
  const base = "absolute rounded-sm flex items-center overflow-hidden leading-none";
  const id = `sign-field-${field.field_id}`;

  if (isStatic) {
    return <div id={id} className={base} style={style}><span className="truncate px-0.5">{field.static_value}</span></div>;
  }

  if (!useSheet) {
    return (
      <div id={id} className={base} style={style}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onActivate}
          placeholder={field.label}
          className="h-full bg-transparent outline-none px-0.5 placeholder:text-slate-400"
          style={{ width: `${Math.max(value.length + 1, 4)}ch`, minWidth: "100%", color: INK, fontSize }}
        />
      </div>
    );
  }

  return (
    <button type="button" id={id} onClick={onActivate} className={`${base} text-left`} style={style}>
      {isDataUrl(value) ? (
        <img src={value} alt={field.label} className="h-full w-auto object-contain" />
      ) : value ? (
        <span className={`truncate px-0.5 ${isSig ? "italic font-serif" : ""}`}>{value}</span>
      ) : (
        <span className="truncate px-0.5 text-slate-400">{field.label}</span>
      )}
    </button>
  );
}

function isDataUrl(v) {
  return typeof v === "string" && v.startsWith("data:image/");
}