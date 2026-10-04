import React, { useState, useEffect, useRef } from "react";
import { Loader2, MousePointerClick, AlertTriangle } from "lucide-react";
import { loadPdfPages, findSnapTarget, textInsideBox } from "@/lib/pdfRender";
import PlacedFieldBox from "@/components/hireiq/PlacedFieldBox";

const DEFAULT_LABELS = { signature: "Signature", date: "Date", name: "Full Name", text: "Custom Text", initial: "Initials" };
const round = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Renders the PDF as page images and lets the admin place, edit, assign,
// move, resize, and remove signing fields. Fields snap to the exact
// bounding box of the text token that was clicked.
export default function PdfFieldPlacer({ pdfUrl, fields, onFieldsChange, pendingFieldType, onPendingFieldPlaced, newFieldLabel }) {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    loadPdfPages(pdfUrl)
      .then((p) => { if (!cancelled) setPages(p); })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load PDF"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pdfUrl]);

  const tokensFor = (pageNum) => pages.find((p) => p.pageNum === pageNum)?.tokens || [];

  const handlePageClick = (e, page) => {
    if (!pendingFieldType) { setActiveIdx(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const snap = findSnapTarget(page.tokens, cx, cy, rect.width, rect.height);
    const box = snap
      ? { x: snap.x, y: snap.y, width: snap.w, height_pct: snap.h }
      : { x: (cx / rect.width) * 100, y: (cy / rect.height) * 100, width: 12, height_pct: 2 };
    const x = clamp(box.x, 0, 99);
    const y = clamp(box.y, 0, 99);
    const label = newFieldLabel?.trim() || DEFAULT_LABELS[pendingFieldType] || "Field";
    const field = {
      field_id: `${label.toLowerCase().replace(/\s+/g, "_")}_${Date.now().toString(36)}`,
      type: pendingFieldType,
      label,
      required: true,
      page: page.pageNum,
      x: round(x),
      y: round(y),
      width: round(clamp(box.width, 1, 100 - x)),
      height_pct: round(clamp(box.height_pct, 0.8, 100 - y)),
      placeholder_text: snap ? snap.text : "",
      assigned_signer: "",
      static_value: "",
    };
    onFieldsChange([...fields, field]);
    setActiveIdx(fields.length);
    onPendingFieldPlaced();
  };

  const startInteraction = (e, idx, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const pageEl = e.currentTarget.closest("[data-pdf-page]");
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    setInteraction({ idx, mode, startX: e.clientX, startY: e.clientY, orig: { ...fields[idx] }, w: rect.width, h: rect.height });
  };

  useEffect(() => {
    if (!interaction) return;
    const { idx, mode, startX, startY, orig, w, h } = interaction;
    const origH = orig.height_pct || 2;
    let moved = false;
    const onMove = (e) => {
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 3) moved = true;
      if (!moved) return;
      const dx = ((e.clientX - startX) / w) * 100;
      const dy = ((e.clientY - startY) / h) * 100;
      const next = mode === "move"
        ? { x: round(clamp(orig.x + dx, 0, 100 - orig.width)), y: round(clamp(orig.y + dy, 0, 100 - origH)) }
        : { width: round(clamp(orig.width + dx, 1, 100 - orig.x)), height_pct: round(clamp(origH + dy, 0.8, 100 - orig.y)) };
      onFieldsChange(fieldsRef.current.map((f, i) => (i === idx ? { ...f, ...next } : f)));
    };
    const onUp = () => {
      setInteraction(null);
      if (!moved) { if (mode === "move") setActiveIdx(idx); return; }
      // Re-record the text now under the box — that's what gets removed on send.
      onFieldsChange(fieldsRef.current.map((f, i) =>
        i === idx ? { ...f, placeholder_text: textInsideBox(tokensFor(f.page || 1), f) } : f
      ));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [interaction]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = (idx, updates) => onFieldsChange(fields.map((f, i) => (i === idx ? { ...f, ...updates } : f)));
  const removeField = (idx) => { setActiveIdx(null); onFieldsChange(fields.filter((_, i) => i !== idx)); };

  if (loading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>;
  }
  if (error) return <div className="text-center text-red-500 py-12 text-sm">{error}</div>;

  const noText = pages.length > 0 && pages.every((p) => p.tokens.length === 0);

  return (
    <div className="relative max-h-[75vh] overflow-y-auto bg-slate-100">
      {pendingFieldType && (
        <div className="sticky top-2 z-30 h-0 flex justify-center pointer-events-none">
          <div className="bg-[#B8956A] text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap">
            <MousePointerClick className="w-3 h-3" /> Click on the page to place the {pendingFieldType} field
          </div>
        </div>
      )}

      {noText && (
        <div className="m-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          This file is a picture of a document with no real text, so fields can't snap to placeholders and the placeholders can't be removed. Re-upload the original Word document (.docx) or a PDF saved from Word.
        </div>
      )}

      <div className="p-2 space-y-4">
        {pages.map((page) => (
          <div key={page.pageNum}>
            <div
              data-pdf-page
              onClick={(e) => handlePageClick(e, page)}
              className={`relative bg-white shadow-sm select-none ${pendingFieldType ? "cursor-crosshair" : ""}`}
            >
              <img src={page.dataUrl} alt={`Page ${page.pageNum}`} draggable={false} className="block w-full pointer-events-none" />
              {fields.map((f, idx) => (f.page || 1) === page.pageNum && (
                <PlacedFieldBox
                  key={f.field_id}
                  field={f}
                  active={activeIdx === idx}
                  onStartMove={(e) => startInteraction(e, idx, "move")}
                  onStartResize={(e) => startInteraction(e, idx, "resize")}
                  onUpdate={(u) => updateField(idx, u)}
                  onRemove={() => removeField(idx)}
                  onClose={() => setActiveIdx(null)}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1 text-center">Page {page.pageNum} of {pages.length}</p>
          </div>
        ))}
      </div>
    </div>
  );
}