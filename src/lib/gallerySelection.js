// Gallery selection persistence.
//
// The gallery's selection used to live only in component memory, so it vanished on refresh and was
// wiped after every download. It is now stored per job and re-validated against the media that is
// actually still available, so a customer can select, download, and then publish the same
// selection without re-picking anything — and a stale id can never survive into a request.

const keyFor = (jobId) => `arriv_gallery_selection_${jobId || "unknown"}`;

export function loadSelection(jobId) {
  if (!jobId) return [];
  try {
    const raw = localStorage.getItem(keyFor(jobId)) || sessionStorage.getItem(keyFor(jobId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveSelection(jobId, ids) {
  if (!jobId) return;
  const payload = JSON.stringify(Array.from(ids || []));
  try {
    localStorage.setItem(keyFor(jobId), payload);
  } catch {
    try { sessionStorage.setItem(keyFor(jobId), payload); } catch { /* private mode */ }
  }
}

export function clearSelection(jobId) {
  if (!jobId) return;
  try { localStorage.removeItem(keyFor(jobId)); } catch { /* ignore */ }
  try { sessionStorage.removeItem(keyFor(jobId)); } catch { /* ignore */ }
}

/** Drops any stored id that is no longer present in the gallery. */
export function reconcileSelection(jobId, availableFiles) {
  const stored = loadSelection(jobId);
  if (stored.length === 0) return [];
  const available = new Set((availableFiles || []).map((f) => f.id));
  const kept = stored.filter((id) => available.has(id));
  if (kept.length !== stored.length) saveSelection(jobId, kept);
  return kept;
}