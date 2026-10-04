import React, { useRef, useState, useEffect } from "react";

const INK = "#0F172A";
const isDataUrl = (v) => typeof v === "string" && v.startsWith("data:image/");

// Signature drawing pad with a "type instead" fallback. Fills its parent.
// onChange receives a PNG data URL (drawn) or plain text (typed).
export default function SignaturePad({ value, onChange, placeholder = "Draw your signature" }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const drawnRef = useRef(isDataUrl(value));
  const [mode, setMode] = useState(value && !isDataUrl(value) ? "type" : "draw");
  const [hasDrawn, setHasDrawn] = useState(isDataUrl(value));
  const [typed, setTyped] = useState(value && !isDataUrl(value) ? value : "");

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    // Re-show a previously drawn signature when the pad is reopened.
    if (isDataUrl(value)) {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(rect.width / img.width, rect.height / img.height);
        const w = img.width * s;
        const h = img.height * s;
        ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h);
      };
      img.src = value;
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    const p = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!drawnRef.current) { drawnRef.current = true; setHasDrawn(true); }
  };

  const up = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (drawnRef.current) onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    drawnRef.current = false;
    setHasDrawn(false);
    onChange?.("");
  };

  const toggle = () => {
    if (mode === "draw") { setMode("type"); onChange?.(typed); }
    else { setMode("draw"); drawnRef.current = false; setHasDrawn(false); onChange?.(""); }
  };

  return (
    <div className="relative w-full h-full min-h-[64px] bg-white" style={{ colorScheme: "light" }}>
      {mode === "draw" ? (
        <>
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          />
          {!hasDrawn && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-slate-400">{placeholder}</div>
          )}
        </>
      ) : (
        <input
          autoFocus
          value={typed}
          onChange={(e) => { setTyped(e.target.value); onChange?.(e.target.value); }}
          placeholder="Type your full name"
          className="absolute inset-0 w-full h-full px-3 bg-transparent outline-none text-xl italic font-serif text-center"
          style={{ color: INK }}
        />
      )}
      <div className="absolute bottom-1 right-1 flex gap-1">
        <button type="button" onClick={toggle} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
          {mode === "draw" ? "Type" : "Draw"}
        </button>
        {mode === "draw" && hasDrawn && (
          <button type="button" onClick={clear} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-red-600 hover:bg-slate-200">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}