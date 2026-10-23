import { useEffect, useRef } from "react";

/**
 * Keeps an applicant's Careers Profile answers on their own device, so closing
 * the page, refreshing, or opening the full job description never loses what
 * they have entered. Nothing is sent anywhere until they submit.
 */
export default function useCareersProfileDraft(key, state, setState, enabled) {
  const restored = useRef(false);

  useEffect(() => {
    if (!enabled || restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        setState((prev) => ({ ...prev, ...saved }));
      }
    } catch (err) {
      /* no draft to restore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !restored.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      /* storage unavailable — the profile still submits normally */
    }
  }, [key, state, enabled]);
}

export function clearCareersProfileDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    /* nothing to clear */
  }
}