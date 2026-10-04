import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const STANDARD_FONT_DATA_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;
const RENDER_WIDTH_PX = 1400;
export const SNAP_THRESHOLD_PX = 60;

// Brackets "[DATE]", merge fields "{{x}}", underscore lines "____", or words.
const TOKEN_RE = /\[[^\]]*\]|\{\{[^}]*\}\}|_{2,}|\[?[^\s[\]_]+\]?/g;

// pdf.js often merges a whole line into one text item — split each item into
// tokens so every word/placeholder gets its own bounding box. All positions
// are percentages of the page.
export function extractTextItems(textContent, viewport) {
  const tokens = [];
  for (const item of textContent.items) {
    const str = item.str || "";
    if (!str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontH = Math.hypot(tx[2], tx[3]);
    const itemW = item.width * viewport.scale;
    if (!fontH || !itemW) continue;
    const charW = itemW / str.length;
    const top = tx[5] - fontH;
    for (const m of str.matchAll(TOKEN_RE)) {
      tokens.push({
        text: m[0],
        x: ((tx[4] + m.index * charW) / viewport.width) * 100,
        y: (top / viewport.height) * 100,
        w: ((m[0].length * charW) / viewport.width) * 100,
        h: (fontH / viewport.height) * 100,
      });
    }
  }
  return tokens;
}

// Loads a PDF and renders every page to a PNG data URL (plus its text tokens).
export async function loadPdfPages(url, { withText = true } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download the document");
  const data = await res.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data, standardFontDataUrl: STANDARD_FONT_DATA_URL }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_WIDTH_PX / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const tokens = withText ? extractTextItems(await page.getTextContent(), viewport) : [];
    pages.push({ pageNum: n, dataUrl: canvas.toDataURL("image/png"), aspect: viewport.height / viewport.width, tokens });
    page.cleanup();
  }
  pdf.destroy();
  return pages;
}

// Finds the text token to snap a click to (click coords + page size in px).
export function findSnapTarget(tokens, clickX, clickY, pageW, pageH) {
  const rects = tokens.map((t) => ({
    t, x: (t.x / 100) * pageW, y: (t.y / 100) * pageH, w: (t.w / 100) * pageW, h: (t.h / 100) * pageH,
  }));
  const tol = 4;
  const sameLine = rects.filter((r) => clickY >= r.y - tol && clickY <= r.y + r.h + tol);

  // 1. Items that contain the click X — smallest wins ("[DATE]" beats a longer run).
  const containing = sameLine.filter((r) => clickX >= r.x && clickX <= r.x + r.w).sort((a, b) => a.w - b.w);
  if (containing.length) return containing[0].t;

  // 2. Nearest horizontal centre on the same line.
  if (sameLine.length) {
    return sameLine.reduce((best, r) =>
      Math.abs(clickX - (r.x + r.w / 2)) < Math.abs(clickX - (best.x + best.w / 2)) ? r : best
    ).t;
  }

  // 3. Nearest by distance, within the snap threshold.
  let best = null;
  let bestD = SNAP_THRESHOLD_PX;
  for (const r of rects) {
    const d = Math.hypot(clickX - (r.x + r.w / 2), clickY - (r.y + r.h / 2));
    if (d < bestD) { bestD = d; best = r; }
  }
  return best ? best.t : null;
}

// Text of the tokens that start inside a field box (what will be removed).
export function textInsideBox(tokens, f) {
  const h = f.height_pct || 2;
  return tokens
    .filter((t) => {
      const cy = t.y + t.h / 2;
      return t.x >= f.x - 0.2 && t.x < f.x + f.width && cy >= f.y && cy <= f.y + h;
    })
    .map((t) => t.text)
    .join(" ");
}