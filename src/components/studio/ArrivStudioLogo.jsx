import React, { useId } from "react";

// Canonical Arriv Studio brand logo — rounded-square aperture mark with
// orange→coral gradient blades + ARRIV/STUDIO wordmark. Recreated as crisp
// SVG so it renders sharply at any size (the uploaded screenshot was low-res).
export default function ArrivStudioLogo({ size = 40, showWordmark = true }) {
  const id = useId().replace(/:/g, "");
  const gradId = `arriv-aperture-${id}`;
  return (
    <div className="flex items-center gap-2.5" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div
        className="rounded-xl flex items-center justify-center shrink-0"
        style={{ width: `${size}px`, height: `${size}px`, background: "#2a2a2a" }}
      >
        <svg viewBox="0 0 100 100" style={{ width: size * 0.62, height: size * 0.62 }}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF9D5C" />
              <stop offset="100%" stopColor="#FF6B5C" />
            </linearGradient>
          </defs>
          <g transform="translate(50,50)">
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <path
                key={a}
                d="M -20 -40 L 20 -40 L 7 -12 L -7 -12 Z"
                fill={`url(#${gradId})`}
                transform={`rotate(${a})`}
              />
            ))}
            <polygon points="0,-10 8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5" fill="#2a2a2a" />
          </g>
        </svg>
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight" style={{ color: "#ffffff", fontSize: size * 0.34 }}>
            ARRIV
          </span>
          <span
            className="font-semibold"
            style={{ color: "#FA8072", fontSize: size * 0.2, letterSpacing: "0.1em" }}
          >
            STUDIO
          </span>
        </div>
      )}
    </div>
  );
}