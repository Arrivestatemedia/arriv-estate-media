import React, { useRef, useState, useEffect, useCallback } from "react";
import { PenTool, Keyboard, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";

// Reusable signature drawing pad with a "type instead" fallback.
// Calls onChange(value) where value is either a data URL (drawn) or typed text.
export default function SignaturePad({ value, onChange, placeholder, className }) {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [mode, setMode] = useState("draw");
  const [typedValue, setTypedValue] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!value) return;
    if (value.startsWith("data:image/")) {
      setMode("draw");
      setHasDrawn(true);
    } else {
      setMode("type");
      setTypedValue(value);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1A1A1A";
    ctx.lineWidth = 2;
    ctxRef.current = ctx;
  }, [mode]);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const startDraw = useCallback((e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e) => {
    if (!drawingRef.current || !ctxRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const last = lastPointRef.current;
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    if (!hasDrawn) setHasDrawn(true);
  }, [getPos, hasDrawn]);

  const endDraw = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      onChange?.(dataUrl);
    }
  }, [onChange]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange?.("");
  }, [onChange]);

  const handleTypeChange = (e) => {
    setTypedValue(e.target.value);
    onChange?.(e.target.value);
  };

  if (mode === "type") {
    return (
      <div className={className}>
        <Input
          value={typedValue}
          onChange={handleTypeChange}
          placeholder={placeholder || "Type your full name"}
          className="h-9 text-sm"
        />
        <button
          onClick={() => { setMode("draw"); onChange?.(""); }}
          className="text-xs text-[#B8956A] hover:underline mt-1 flex items-center gap-1"
        >
          <PenTool className="w-3 h-3" /> Draw instead
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="w-full h-24 border-2 border-dashed border-[#B8956A]/40 rounded-lg cursor-crosshair touch-none bg-white"
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-[#1A1A1A]/40 flex items-center gap-1">
              <PenTool className="w-3 h-3" /> Draw your signature here
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        <button
          onClick={() => { setMode("type"); setHasDrawn(false); onChange?.(typedValue); }}
          className="text-xs text-[#B8956A] hover:underline flex items-center gap-1"
        >
          <Keyboard className="w-3 h-3" /> Type instead
        </button>
        {hasDrawn && (
          <button
            onClick={clear}
            className="text-xs text-red-500 hover:underline flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}