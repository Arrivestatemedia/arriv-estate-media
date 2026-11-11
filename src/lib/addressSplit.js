import { US_STATES } from "@/lib/usStates";

/** "Georgia" and "GA" both become "GA"; anything unknown becomes "". */
function toStateCode(value) {
  const raw = String(value || "").trim().replace(/\.$/, "");
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const byCode = US_STATES.find((s) => s.code === upper);
  if (byCode) return byCode.code;
  const lower = raw.toLowerCase();
  const byName = US_STATES.find((s) => s.name.toLowerCase() === lower);
  return byName ? byName.code : "";
}

/** "Lawrenceville GA 30047" / "Lawrenceville, Georgia" -> { city, state } */
function parseCityState(tail) {
  const cleaned = String(tail || "").replace(/\s+\d{5}(-\d{4})?\s*$/, "").trim();
  if (!cleaned) return null;
  const words = cleaned.split(" ").filter(Boolean);
  // A state is either one word ("GA", "Georgia") or two ("New York").
  for (const take of [1, 2]) {
    if (words.length <= take) continue;
    const code = toStateCode(words.slice(-take).join(" "));
    if (code) return { city: words.slice(0, -take).join(" "), state: code };
  }
  return null;
}

/**
 * Splits a whole address into the three fields the booking form keeps apart, so
 * "141 Trigg Court, Lawrenceville, Georgia 30047" fills Street, City and State instead
 * of landing entirely in the street box. Returns null when the text is a street on its
 * own — a bare street is never guessed apart.
 */
export function splitAddress(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const tail = parts[parts.length - 1];
    const street = parts.slice(0, -2).join(", ");
    if (/^\d{5}(-\d{4})?$/.test(tail)) {
      // "…, Lawrenceville, 30047" — no state given.
      return { street, city, state: "" };
    }
    // The state may arrive as "Georgia 30047" or "GA 30047": the ZIP comes off first.
    const code = toStateCode(tail.replace(/\s+\d{5}(-\d{4})?$/, "").trim());
    if (code) return { street, city, state: code };
    const parsed = parseCityState(tail);
    if (parsed?.city) return { street: parts.slice(0, -1).join(", "), ...parsed };
    return null;
  }

  if (parts.length === 2) {
    const parsed = parseCityState(parts[1]);
    if (parsed) return { street: parts[0], ...parsed };
  }

  return null;
}