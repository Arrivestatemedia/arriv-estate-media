import React, { useState, useRef, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2, Trash2, MousePointerClick } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const FIELD_TYPES = [
  { type: "signature", label: "Signature", placeholder: "Signature" },
  { type: "date", label: "Date", placeholder: "Date" },
  { type: "name", label: "Name", placeholder: "Full Name" },
  { type: "text", label: "Text", placeholder: "Custom Text" },
  { type: "initial", label: "Initials", placeholder: "Initials" },
];

const FIELD_COLORS = {
  signature: { border: "#B8956A", bg: "rgba(184,149,106,0.12)", text: "#8B6F4A" },
  date: { border: "#B8956A", bg: "rgba(184,149,106,0.12)", text: "#8B6F4A" },
  name: { border: "#3B82F6", bg: "rgba(59,130,246,0.10)", text: "#2563EB" },
  text: { border: "#64748B", bg: "rgba(100,116,139,0.10)", text: "#475569" },
  initial: { border: "#8B5CF6", bg: "rgba(139,92,246,0.10)", text: "#7C3AED" },
};

const SNAP_DIST_PX = 32;

function PdfPageCanvas({ pdf, pageNum, renderWidth, onReady }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        const baseVp = page.getViewport({ scale: 1 });
        const scale = renderWidth / baseVp.width;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const textContent = await page.getTextContent();
        const textItems = textContent.items
          .map((item) => {
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            return {
              text: item.str,
              x: tx[4],
              y: tx[5] - Math.abs(tx[3]),
              width: item.width * scale,
              height: Math.abs(tx[3]),
            };
          })
          .filter((t) => t.text.trim());

        if (!cancelled) {
          onReady({ pageNum, width: viewport.width, height: viewport.height, textItems });
          setLoading(false);
        }
      } catch (e) {
        console.error("Page render error:", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, pageNum, onReady]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="block shadow-sm rounded" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 rounded">
          <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
        </div>
      )}
    </div>
  );
}

export default function PdfFieldPlacer({
  pdfUrl,
  fields,
  onFieldsChange,
  pendingFieldType,
  onPendingFieldPlaced,
  newFieldLabel,
}) {
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageInfo, setPageInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(680);

  // Measure container width for responsive rendering
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Re-render pages when container width changes
  useEffect(() => {
    if (pdf && numPages > 0) {
      setPageInfo({});
    }
  }, [containerWidth, pdf, numPages]);

  // Load PDF document
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setPdf(null);
    setNumPages(0);
    setPageInfo({});

    (async () => {
      try {
        const res = await fetch(pdfUrl);
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (e) {
        console.error("PDF load error:", e);
        if (!cancelled) {
          setError("Failed to load PDF");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  const handlePageReady = useCallback((info) => {
    setPageInfo((prev) => ({ ...prev, [info.pageNum]: info }));
  }, []);

  // Click to place a field — snaps to nearest text item
  const handlePageClick = (e, pageNum) => {
    if (!pendingFieldType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const info = pageInfo[pageNum];
    if (!info) return;

    let nearest = null;
    let minDist = Infinity;
    for (const item of info.textItems) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const dist = Math.hypot(clickX - cx, clickY - cy);
      if (dist < minDist && dist < SNAP_DIST_PX) {
        minDist = dist;
        nearest = item;
      }
    }

    let xPct, yPct, widthPct, heightPct, placeholderText;
    if (nearest) {
      xPct = (nearest.x / info.width) * 100;
      yPct = (nearest.y / info.height) * 100;
      widthPct = Math.max((nearest.width / info.width) * 100, 10);
      heightPct = Math.max((nearest.height / info.height) * 100, 3);
      placeholderText = nearest.text;
    } else {
      xPct = (clickX / info.width) * 100;
      yPct = (clickY / info.height) * 100;
      widthPct = pendingFieldType === "signature" || pendingFieldType === "name" ? 35 : 20;
      heightPct = 4;
      placeholderText = "";
    }

    const ft = FIELD_TYPES.find((f) => f.type === pendingFieldType);
    const label = newFieldLabel.trim() || ft?.placeholder || "Field";
    const fieldId = `${label.replace(/\s+/g, "_").toLowerCase()}_${Date.now().toString(36)}`;

    onFieldsChange([
      ...fields,
      {
        field_id: fieldId,
        type: pendingFieldType,
        label,
        required: true,
        x: Math.round(xPct * 10) / 10,
        y: Math.round(yPct * 10) / 10,
        page: pageNum,
        width: Math.round(widthPct * 10) / 10,
        height_pct: Math.round(heightPct * 10) / 10,
        placeholder_text: placeholderText,
        assigned_signer: "",
        static_value: "",
      },
    ]);
    onPendingFieldPlaced();
  };

  // Drag to move
  const handleFieldMouseDown = (e, idx) => {
    e.stopPropagation();
    e.preventDefault();
    const field = fields[idx];
    const info = pageInfo[field.page];
    if (!info) return;
    setDragging({
      fieldIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x,
      origY: field.y,
      pageWidth: info.width,
      pageHeight: info.height,
    });
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const dxPct = ((e.clientX - dragging.startX) / dragging.pageWidth) * 100;
      const dyPct = ((e.clientY - dragging.startY) / dragging.pageHeight) * 100;
      const newX = Math.max(0, Math.min(95, dragging.origX + dxPct));
      const newY = Math.max(0, Math.min(97, dragging.origY + dyPct));
      onFieldsChange(
        fields.map((f, i) =>
          i === dragging.fieldIdx
            ? { ...f, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 }
            : f
        )
      );
    };
    const up = () => setDragging(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging, fields, onFieldsChange]);

  // Resize
  const handleResizeMouseDown = (e, idx) => {
    e.stopPropagation();
    e.preventDefault();
    const field = fields[idx];
    const info = pageInfo[field.page];
    if (!info) return;
    setResizing({
      fieldIdx: idx,
      startX: e.clientX,
      origWidth: field.width,
      pageWidth: info.width,
    });
  };

  useEffect(() => {
    if (!resizing) return;
    const move = (e) => {
      const dxPct = ((e.clientX - resizing.startX) / resizing.pageWidth) * 100;
      const newWidth = Math.max(8, Math.min(100, resizing.origWidth + dxPct));
      onFieldsChange(
        fields.map((f, i) =>
          i === resizing.fieldIdx ? { ...f, width: Math.round(newWidth * 10) / 10 } : f
        )
      );
    };
    const up = () => setResizing(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [resizing, fields, onFieldsChange]);

  const updateField = (idx, updates) => {
    onFieldsChange(fields.map((f, i) => (i === idx ? { ...f, ...updates } : f)));
  };

  const removeField = (idx) => {
    onFieldsChange(fields.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }
  if (error) {
    return <div className="text-center text-red-500 py-12">{error}</div>;
  }
  if (!pdf) return null;

  return (
    <div ref={containerRef} className="space-y-6 w-full">
      {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
        const info = pageInfo[pageNum];
        const pageWidth = info?.width || containerWidth;
        const pageHeight = info?.height || 800;
        const pageFields = fields.filter((f) => f.page === pageNum);
        return (
          <div key={pageNum} className="relative w-full">
            <div
              onClick={(e) => handlePageClick(e, pageNum)}
              className={`relative w-full ${pendingFieldType ? "cursor-crosshair" : ""}`}
              style={{ width: pageWidth, minHeight: pageHeight }}
            >
              <PdfPageCanvas pdf={pdf} pageNum={pageNum} renderWidth={containerWidth} onReady={handlePageReady} />

              {pageFields.map((f) => {
                const realIdx = fields.indexOf(f);
                const colors = FIELD_COLORS[f.type] || FIELD_COLORS.text;
                return (
                  <div
                    key={f.field_id}
                    className="absolute"
                    style={{
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      width: `${f.width}%`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Label + delete bar */}
                    <div
                      className="absolute -top-6 left-0 flex items-center gap-1"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        value={f.label}
                        onChange={(e) => updateField(realIdx, { label: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium px-1.5 py-0.5 rounded bg-white border shadow-sm w-28"
                        style={{ color: colors.text, borderColor: colors.border }}
                        placeholder="Label"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(realIdx); }}
                        className="text-red-500 hover:text-red-700 bg-white rounded shadow-sm p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Field body */}
                    <div
                      className="rounded-md border-2 cursor-move flex items-center justify-center min-h-[32px]"
                      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
                      onMouseDown={(e) => handleFieldMouseDown(e, realIdx)}
                    >
                      {f.type === "text" ? (
                        <input
                          value={f.static_value || ""}
                          onChange={(e) => updateField(realIdx, { static_value: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full bg-transparent text-xs text-slate-700 text-center px-1 outline-none"
                          placeholder="(signer fills in)"
                        />
                      ) : (
                        <span className="text-xs font-medium capitalize" style={{ color: colors.text }}>
                          {f.type === "signature" ? "✍️ Signature" : f.type}
                        </span>
                      )}
                    </div>

                    {/* Signer email */}
                    <div className="absolute top-full left-0 mt-0.5" onMouseDown={(e) => e.stopPropagation()}>
                      <input
                        value={f.assigned_signer || ""}
                        onChange={(e) => updateField(realIdx, { assigned_signer: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-1.5 py-0.5 rounded bg-white border border-slate-200 shadow-sm w-36"
                        placeholder="Signer email"
                      />
                    </div>

                    {/* Resize handle */}
                    <div
                      onMouseDown={(e) => handleResizeMouseDown(e, realIdx)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 rounded-sm cursor-se-resize"
                      style={{ borderColor: colors.border }}
                    />
                  </div>
                );
              })}

              {pendingFieldType && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#B8956A] text-white text-xs px-3 py-1 rounded-full shadow-lg pointer-events-none z-10">
                  <MousePointerClick className="w-3 h-3 inline mr-1" />
                  Click on text to place the {pendingFieldType} field
                </div>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">Page {pageNum}</div>
          </div>
        );
      })}
    </div>
  );
}