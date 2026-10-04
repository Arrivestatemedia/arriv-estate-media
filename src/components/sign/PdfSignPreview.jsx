import React, { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { loadPdfPages } from "@/lib/pdfRender";
import SignField from "@/components/sign/SignField";
import FieldEditorSheet from "@/components/sign/FieldEditorSheet";

const isSig = (f) => f.type === "signature" || f.type === "initial";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Renders the PDF for the signer as page images with each field overlaid at
// the exact spot (and size) the admin placed it.
export default function PdfSignPreview({ pdfUrl, fields, values, onChange, showMissing }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [displayWidth, setDisplayWidth] = useState(800);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPdfPages(pdfUrl, { withText: false })
      .then((p) => { if (!cancelled) setPages(p); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load document"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => entry.contentRect.width && setDisplayWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Reading order: page, then top-to-bottom, then left-to-right (static fields excluded).
  const orderedFields = useMemo(
    () => fields.filter((f) => !f.static_value).sort((a, b) => (a.page || 1) - (b.page || 1) || a.y - b.y || a.x - b.x),
    [fields]
  );
  const fieldsByPage = useMemo(() => {
    const map = {};
    for (const f of fields) (map[f.page || 1] ||= []).push(f);
    return map;
  }, [fields]);

  useEffect(() => {
    if (activeFieldId) document.getElementById(`sign-field-${activeFieldId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeFieldId]);

  const compact = displayWidth < 640;
  const fontFor = (field, page) => clamp(displayWidth * page.aspect * ((field.height_pct || 2) / 100) * 0.8, 7, 22);
  const activeField = orderedFields.find((f) => f.field_id === activeFieldId);
  const nextField = activeField ? orderedFields[orderedFields.indexOf(activeField) + 1] : null;

  return (
    <div ref={containerRef} className="w-full">
      {loading ? (
        <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-500">{error}</div>
      ) : (
        pages.map((page) => (
          <div key={page.pageNum} className="mb-4">
            <p className="text-[11px] text-slate-400 mb-1">Page {page.pageNum} of {pages.length}</p>
            <div className="relative bg-white shadow-sm border border-slate-200">
              <img src={page.dataUrl} alt={`Page ${page.pageNum}`} draggable={false} className="block w-full select-none" />
              {(fieldsByPage[page.pageNum] || []).map((f) => (
                <SignField
                  key={f.field_id}
                  field={f}
                  value={values[f.field_id] || ""}
                  active={activeFieldId === f.field_id}
                  missing={showMissing && f.required !== false && !f.static_value && !String(values[f.field_id] || "").trim()}
                  useSheet={compact || isSig(f)}
                  fontSize={fontFor(f, page)}
                  onActivate={() => setActiveFieldId(f.field_id)}
                  onChange={(v) => onChange(f.field_id, v)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {activeField && (compact || isSig(activeField)) && (
        <FieldEditorSheet
          field={activeField}
          value={values[activeField.field_id] || ""}
          onChange={(v) => onChange(activeField.field_id, v)}
          onClose={() => setActiveFieldId(null)}
          onNext={nextField ? () => setActiveFieldId(nextField.field_id) : null}
        />
      )}
    </div>
  );
}