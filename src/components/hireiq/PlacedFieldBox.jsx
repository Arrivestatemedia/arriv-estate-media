import React from "react";
import { Trash2, Check, X } from "lucide-react";

const TYPE_STYLES = {
  signature: { border: "border-amber-500", text: "text-amber-700" },
  date: { border: "border-blue-500", text: "text-blue-700" },
  name: { border: "border-orange-500", text: "text-orange-700" },
  text: { border: "border-slate-500", text: "text-slate-700" },
  initial: { border: "border-purple-500", text: "text-purple-700" },
};

const stop = (e) => e.stopPropagation();

// One placed field on the admin's PDF preview: label above, signer email
// below, trash top-right, resize handle bottom-right, popover when active.
export default function PlacedFieldBox({ field, active, onStartMove, onStartResize, onUpdate, onRemove, onClose }) {
  const s = TYPE_STYLES[field.type] || TYPE_STYLES.text;
  const value = field.static_value || "";

  return (
    <div
      className="absolute z-10"
      style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height_pct || 2}%` }}
      onClick={stop}
    >
      <span className={`absolute -top-3 left-0 text-[9px] font-semibold capitalize leading-none whitespace-nowrap ${s.text}`}>
        {field.label}
      </span>

      <div
        onMouseDown={onStartMove}
        className={`absolute inset-0 border-2 ${s.border} bg-white rounded-sm cursor-move flex items-center overflow-hidden px-0.5 ${active ? "ring-2 ring-blue-400" : ""}`}
        style={{ containerType: "size" }}
      >
        {value && <span className="truncate text-slate-900 leading-none" style={{ fontSize: "75cqh" }}>{value}</span>}
      </div>

      <button
        type="button"
        onMouseDown={stop}
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center text-red-500 hover:text-red-700"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>

      <div onMouseDown={onStartResize} className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize" />

      <input
        value={field.assigned_signer || ""}
        onChange={(e) => onUpdate({ assigned_signer: e.target.value })}
        onMouseDown={stop}
        placeholder="signer email"
        className="absolute top-full left-0 mt-1 w-36 text-[9px] px-1 py-0.5 rounded border border-slate-200 bg-white shadow-sm outline-none focus:border-blue-400"
      />

      {active && (
        <div onMouseDown={stop} className="absolute bottom-full left-0 mb-4 z-20 flex items-center gap-1 bg-white border border-slate-200 shadow-lg rounded-lg p-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => onUpdate({ static_value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && value.trim() && onClose()}
            placeholder="Type the text for this field"
            className="w-56 h-7 text-xs px-2 rounded border border-slate-200 outline-none focus:border-blue-400"
          />
          <button type="button" disabled={!value.trim()} onClick={onClose} className="h-7 w-7 rounded bg-[#B8956A] text-white flex items-center justify-center disabled:opacity-40">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onClose} className="h-7 w-7 rounded border border-slate-200 text-slate-500 flex items-center justify-center hover:bg-slate-50">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}