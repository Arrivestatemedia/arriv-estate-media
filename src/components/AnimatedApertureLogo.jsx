import React, { useEffect, useState } from "react";
import { motion, useMotionValue, useMotionValueEvent, animate } from "framer-motion";

const N = 6; // number of aperture blades
const R = 100; // outer blade radius
const RING = 110; // outer ring radius
const rMin = 16; // opening radius when "closed"
const rMax = 80; // opening radius when "open"
const GOLD = "#B8956A";

// Build a single blade path for a given openness (0..1).
// The central opening is a regular N-gon whose circumradius scales with openness.
function bladePath(i, o) {
  const a1 = (i * 2 * Math.PI) / N;
  const a2 = ((i + 1) * 2 * Math.PI) / N;
  const r = rMin + o * (rMax - rMin);
  const v1x = (r * Math.cos(a1)).toFixed(2);
  const v1y = (r * Math.sin(a1)).toFixed(2);
  const v2x = (r * Math.cos(a2)).toFixed(2);
  const v2y = (r * Math.sin(a2)).toFixed(2);
  const o1x = (R * Math.cos(a1)).toFixed(2);
  const o1y = (R * Math.sin(a1)).toFixed(2);
  const o2x = (R * Math.cos(a2)).toFixed(2);
  const o2y = (R * Math.sin(a2)).toFixed(2);
  // inner edge (polygon side) -> out to ring -> arc along ring -> back
  return `M ${v1x} ${v1y} L ${v2x} ${v2y} L ${o2x} ${o2y} A ${R} ${R} 0 0 0 ${o1x} ${o1y} Z`;
}

export default function AnimatedApertureLogo({ size = 260 }) {
  const o = useMotionValue(1);
  const [paths, setPaths] = useState(() =>
    Array.from({ length: N }, (_, i) => bladePath(i, 1))
  );

  useEffect(() => {
    // "Taking a picture" cycle: open -> snap closed -> hold -> open -> rest
    const controls = animate(o, [1, 0.05, 0.05, 1, 1], {
      times: [0, 0.12, 0.22, 0.38, 1],
      duration: 4.2,
      repeat: Infinity,
      ease: [0.45, 0, 0.15, 1],
    });
    return () => controls.stop();
  }, [o]);

  useMotionValueEvent(o, "change", (latest) => {
    setPaths(Array.from({ length: N }, (_, i) => bladePath(i, latest)));
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="-125 -125 250 250" width={size} height={size}>
        <defs>
          <radialGradient id="apGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" />
            <stop offset="60%" stopColor={GOLD} stopOpacity="0.08" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* soft glow */}
        <circle cx="0" cy="0" r="120" fill="url(#apGlow)" />

        {/* outer lens ring */}
        <circle cx="0" cy="0" r={RING} fill="none" stroke={GOLD} strokeWidth="2" opacity="0.9" />
        <circle cx="0" cy="0" r={RING - 6} fill="none" stroke={GOLD} strokeWidth="0.75" opacity="0.4" />

        {/* rotating aperture blades */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {paths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill={GOLD}
              fillOpacity="0.92"
              stroke="#1A1A1A"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ))}
        </motion.g>

        {/* center "A" — stays upright */}
        <text
          x="0"
          y="2"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="46"
          fontWeight="700"
          fill="#FFFBF5"
        >
          A
        </text>
      </svg>
    </div>
  );
}