import React from "react";
import { CheckCircle2, Pencil, Trash2, X, Plus } from "lucide-react";

const GOLD = "#B8956A";
const CREAM = "#FFFBF5";

export default function TrustBadgesRow({ badges, editMode, onEdit, onDeleteRow, onRemoveBadge }) {
  if (!badges.length && !editMode) return null;

  return (
    <div className="relative" style={{ backgroundColor: "#1A1A1A", color: CREAM }}>
      <div className={`max-w-5xl mx-auto px-5 sm:px-6 lg:px-8 pb-10 -mt-2 ${editMode ? "pt-4 border-2 border-dashed border-blue-400 rounded-lg" : ""}`}>
        {editMode && (
          <div className="flex items-center justify-between mb-3">
            <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded shadow">Trust Badges</span>
            <div className="flex items-center gap-1.5">
              <button onClick={onEdit} title="Edit badges" className="flex items-center justify-center w-8 h-8 rounded-md bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 shadow">
                <Pencil className="w-4 h-4" />
              </button>
              {badges.length > 0 && (
                <button onClick={onDeleteRow} title="Remove all badges" className="flex items-center justify-center w-8 h-8 rounded-md bg-white text-red-600 border border-red-200 hover:bg-red-50 shadow">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
        {badges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {badges.map((t, i) => (
              <div key={`${t}-${i}`} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-sm font-medium" style={{ color: "rgba(255,251,245,0.9)" }}>{t}</span>
                {editMode && (
                  <button onClick={() => onRemoveBadge(i)} title="Remove badge" className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <button onClick={onEdit} className="flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-blue-200">
            <Plus className="w-4 h-4" /> Add trust badges
          </button>
        )}
      </div>
    </div>
  );
}