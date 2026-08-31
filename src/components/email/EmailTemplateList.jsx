import React from "react";
import { EMAIL_CATALOG, EMAIL_CATEGORIES, getCategoryCount } from "@/lib/emailCatalog";
import { Mail, CheckCircle2 } from "lucide-react";

export default function EmailTemplateList({ savedKeys, selectedKey, onSelect }) {
  return (
    <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {EMAIL_CATEGORIES.map((cat) => {
        const entries = EMAIL_CATALOG.filter((e) => e.category === cat);
        if (entries.length === 0) return null;
        return (
          <div key={cat} className="mb-4">
            <div className="px-3 py-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#B8956A]">{cat}</h3>
              <span className="text-xs text-[#1A1A1A]/40">{getCategoryCount(cat)}</span>
            </div>
            {entries.map((entry) => {
              const isSaved = savedKeys.has(entry.key);
              const isSelected = selectedKey === entry.key;
              return (
                <button
                  key={entry.key}
                  onClick={() => onSelect(entry.key)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors border-l-2 ${
                    isSelected
                      ? "bg-[#B8956A]/10 border-[#B8956A]"
                      : "border-transparent hover:bg-[#1A1A1A]/5"
                  }`}
                >
                  {isSaved ? (
                    <CheckCircle2 className="w-4 h-4 text-[#B8956A] shrink-0 mt-0.5" />
                  ) : (
                    <Mail className="w-4 h-4 text-[#1A1A1A]/30 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? "text-[#1A1A1A]" : "text-[#1A1A1A]/70"}`}>
                      {entry.name}
                    </p>
                    <p className="text-xs text-[#1A1A1A]/40 truncate">{entry.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}