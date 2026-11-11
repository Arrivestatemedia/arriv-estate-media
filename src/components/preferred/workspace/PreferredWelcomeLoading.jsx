import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crown } from "lucide-react";

/**
 * The moment a customer becomes Preferred: a welcome by name while the workspace loads.
 * The bar climbs to 100% as the membership is confirmed, then hands over to the workspace.
 *
 * Rendered into the page body so the page transition's transform can never drag it
 * to the top of the screen: the welcome always sits in the middle of the viewport.
 */
export default function PreferredWelcomeLoading({ firstName, ready, onDone }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const ceiling = ready ? 100 : 95;
    const timer = setInterval(() => {
      setProgress((value) => {
        if (value >= ceiling) return value;
        const step = value < 45 ? 4 : value < 80 ? 2 : 1;
        return Math.min(ceiling, value + step);
      });
    }, 130);
    return () => clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    if (progress < 100) return undefined;
    const timer = setTimeout(onDone, 650);
    return () => clearTimeout(timer);
  }, [progress, onDone]);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-[#0f1315] px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#c8a87c]/35 bg-[#c8a87c]/10">
        <Crown className="h-7 w-7 text-[#d9bd95]" />
      </span>

      <p className="mt-6 text-[10px] uppercase tracking-[0.32em] text-[#c8a87c]">Arriv Preferred</p>
      <h1 className="preferred-gold-text mt-2 font-serif text-3xl leading-tight sm:text-4xl">
        Welcome to Preferred{firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="mt-3 text-[13.5px] text-[#f6f1e8]/60">
        {ready ? "Your concierge is ready." : "Your experience is loading"}
      </p>

      <div className="mt-7 h-[3px] w-[min(420px,80vw)] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#c8a87c] transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] tabular-nums text-[#f6f1e8]/40">{progress}%</p>
    </div>,
    document.body
  );
}