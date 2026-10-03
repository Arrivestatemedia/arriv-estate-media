// Forces a real file download (save dialog) instead of opening in a new tab.
// Fetches the URL as a blob, then triggers a download via an anchor element.
// Falls back to a direct anchor click if the fetch fails (e.g. CORS), so the
// user still gets the file even if we can't force the save dialog.
export async function forceDownload(url, filename) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoke after a short delay so the download has time to start
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (e) {
    // Fallback: direct anchor click (may open in tab if cross-origin blocks download attr)
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "document.pdf";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Build a safe filename from a document title
export function buildDocFilename(title, fallback = "document.pdf") {
  if (!title) return fallback;
  const safe = title.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");
  return (safe || fallback) + (fallback.endsWith(".pdf") ? "" : ".pdf");
}