// Client-side DOCX → PDF conversion using mammoth + jsPDF.
// Mirrors Arriv One's approach: each word is written as real, selectable
// PDF text (not an image), so the signing field placer can extract text
// tokens and pdfTextRemoval can physically remove placeholder text.
import mammoth from "mammoth/mammoth.browser";
import { jsPDF } from "jspdf";

const PAGE_WIDTH_PX = 816;   // US Letter @ 96dpi
const PAGE_HEIGHT_PX = 1056;  // US Letter @ 96dpi
const MARGIN_X_PX = 80;
const MARGIN_Y_PX = 72;
const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - MARGIN_Y_PX * 2; // 912
const PX_TO_PT = 0.75;        // 96dpi px → 72pt

const RENDER_CSS = `
.docx-render { font-family: 'Times New Roman', Times, serif; font-size: 16px; line-height: 1.5; color: #1a1a1a; }
.docx-render p { margin: 0 0 12px; }
.docx-render h1 { font-size: 28px; font-weight: bold; margin: 0 0 16px; }
.docx-render h2 { font-size: 22px; font-weight: bold; margin: 20px 0 12px; }
.docx-render h3 { font-size: 18px; font-weight: bold; margin: 16px 0 10px; }
.docx-render h4 { font-size: 16px; font-weight: bold; margin: 14px 0 8px; }
.docx-render ul, .docx-render ol { margin: 0 0 12px; padding-left: 32px; }
.docx-render li { margin: 0 0 6px; }
.docx-render table { border-collapse: collapse; width: 100%; margin: 0 0 12px; }
.docx-render td, .docx-render th { border: 1px solid #ccc; padding: 6px 8px; }
.docx-render img { max-width: 100%; height: auto; }
.docx-render a { color: #1a1a1a; text-decoration: underline; }
.docx-render strong { font-weight: bold; }
.docx-render em { font-style: italic; }
.docx-render hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
`;

function waitForImages(container) {
  const imgs = Array.from(container.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          })
    )
  );
}

function detectImageFormat(src) {
  if (!src) return "PNG";
  const lower = src.toLowerCase();
  if (lower.startsWith("data:image/jpeg") || lower.startsWith("data:image/jpg")) return "JPEG";
  if (lower.startsWith("data:image/gif")) return "GIF";
  if (lower.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

function collectItems(container) {
  const items = [];
  const containerRect = container.getBoundingClientRect();

  // Text nodes via TreeWalker
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    if (!text || !text.trim()) continue;

    const parentEl = textNode.parentElement;
    const computed = window.getComputedStyle(parentEl);
    const fontFamily = computed.fontFamily.replace(/["']/g, "").split(",")[0].trim() || "Times";
    const fontSizePx = parseFloat(computed.fontSize) || 16;
    const fontWeight = computed.fontWeight;
    const isItalic = computed.fontStyle === "italic" || computed.fontStyle === "oblique";
    const colorRgb = computed.color.match(/\d+/g);
    const color = colorRgb ? colorRgb.slice(0, 3).map(Number) : [26, 26, 26];

    // Font variant for jsPDF: "normal" | "bold" | "italic" | "bolditalic"
    let variant = fontWeight >= 600 ? "bold" : "normal";
    if (isItalic) variant = variant === "bold" ? "bolditalic" : "italic";

    // Check if inside <u> or <a> (underline/link)
    const isUnderlined = !!parentEl.closest("u, a");

    const words = text.match(/\S+/g) || [];
    let charIdx = 0;
    for (const word of words) {
      const wordStart = text.indexOf(word, charIdx);
      charIdx = wordStart + word.length;
      const range = document.createRange();
      range.setStart(textNode, wordStart);
      range.setEnd(textNode, wordStart + word.length);
      const rects = range.getClientRects();
      if (rects.length === 0) continue;
      const rect = rects[0];
      // Position relative to container border-box (already includes padding offset)
      const x = rect.left - containerRect.left;
      const y = rect.top - containerRect.top;
      // Page breaks every PAGE_HEIGHT_PX; yInPage is position from top of that page
      const page = Math.floor(y / PAGE_HEIGHT_PX);
      const yInPage = y - page * PAGE_HEIGHT_PX;

      items.push({
        kind: "text",
        page,
        text: word,
        x,
        y: yInPage,
        fontPx: fontSizePx,
        font: fontFamily,
        variant,
        color,
        underline: isUnderlined,
        rectWidth: rect.width,
      });
    }
  }

  // Images
  const imgs = container.querySelectorAll("img");
  imgs.forEach((img) => {
    const rect = img.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = rect.left - containerRect.left;
    const y = rect.top - containerRect.top;
    const page = Math.floor(y / PAGE_HEIGHT_PX);
    const yInPage = y - page * PAGE_HEIGHT_PX;
    items.push({
      kind: "image",
      page,
      src: img.src,
      format: detectImageFormat(img.src),
      x,
      y: yInPage,
      w: rect.width,
      h: rect.height,
    });
  });

  return items;
}

/**
 * Converts a .docx File/Blob to a PDF Blob with selectable text.
 * @param {File|Blob} docxFile
 * @returns {Promise<Blob>}
 */
export async function convertDocxToPdfBlob(docxFile) {
  const arrayBuffer = await docxFile.arrayBuffer();

  // Step 1: DOCX → HTML via mammoth (preserve <u> tags)
  const mammothResult = await mammoth.convertToHtml(
    { arrayBuffer },
    { styleMap: ["u => u"] }
  );
  const html = mammothResult.value;

  // Step 2: Off-screen layout
  const styleTag = document.createElement("style");
  styleTag.textContent = RENDER_CSS;
  document.head.appendChild(styleTag);

  const container = document.createElement("div");
  container.className = "docx-render";
  container.style.cssText = `
    position: absolute;
    left: -99999px;
    top: 0;
    width: ${PAGE_WIDTH_PX}px;
    padding: ${MARGIN_Y_PX}px ${MARGIN_X_PX}px;
    box-sizing: border-box;
    background: #fff;
  `;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    // Step 3: Wait for images
    await waitForImages(container);

    // Step 4: Collect positions
    const items = collectItems(container);

    // Step 5: Write PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter",
    });

    const maxPage = items.reduce((mx, it) => Math.max(mx, it.page), 0);
    // jsPDF starts with 1 page; add the rest
    for (let p = 1; p <= maxPage; p++) {
      pdf.addPage();
    }

    for (const item of items) {
      // Switch to the correct page (1-indexed)
      pdf.setPage(item.page + 1);

      const xPt = item.x * PX_TO_PT;
      const yPt = item.y * PX_TO_PT;

      if (item.kind === "text") {
        pdf.setFont(item.font, item.variant);
        pdf.setFontSize(item.fontPx * PX_TO_PT);
        pdf.setTextColor(item.color[0], item.color[1], item.color[2]);
        pdf.text(item.text, xPt, yPt);
        if (item.underline) {
          pdf.setDrawColor(item.color[0], item.color[1], item.color[2]);
          pdf.setLineWidth(0.5);
          pdf.line(xPt, yPt + 1, xPt + item.rectWidth * PX_TO_PT, yPt + 1);
        }
      } else if (item.kind === "image") {
        try {
          const format = item.format === "WEBP" ? "PNG" : item.format;
          pdf.addImage(
            item.src,
            format,
            xPt,
            yPt,
            item.w * PX_TO_PT,
            item.h * PX_TO_PT
          );
        } catch (_) {
          // Skip images that fail to embed
        }
      }
    }

    return pdf.output("blob");
  } finally {
    // Step 6: Cleanup
    document.body.removeChild(container);
    document.head.removeChild(styleTag);
  }
}