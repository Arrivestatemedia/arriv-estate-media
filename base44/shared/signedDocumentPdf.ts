// Signed document PDF generator.
// For editor docs: renders the merged HTML + signature values into a jsPDF.
// For upload docs: overlays signature values on the original PDF using pdf-lib.
//
// Both functions return a Uint8Array of the final PDF bytes, which the caller
// uploads to private storage and stores on SignRequest.signed_pdf_uri.

import { jsPDF } from "npm:jspdf@4.0.0";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

interface SignatureField {
  field_id: string;
  type: "signature" | "date" | "name" | "text" | "initial";
  label: string;
  required?: boolean;
  x?: number;
  y?: number;
  page?: number;
  width?: number;
  height_pct?: number;
  assigned_signer?: string;
  placeholder_text?: string;
  static_value?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Simple HTML to structured plain text conversion.
// Preserves paragraphs, headings, lists, bold/italic, and links.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/?div[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/?ul[^>]*>/gi, "\n")
    .replace(/<\/?ol[^>]*>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "$1")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "$1")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "$1")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "$1")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "$1")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Replace {{sig:Label}}, {{date:Label}}, etc. placeholders in HTML with values.
function replaceSignaturePlaceholders(
  html: string,
  fields: SignatureField[],
  fieldValues: Record<string, string>
): string {
  let result = html;
  for (const field of fields) {
    const value = fieldValues[field.field_id] || "";
    const typeKey = field.type === "signature" ? "sig" : field.type;
    const placeholder = `{{${typeKey}:${field.label}}}`;
    const placeholderRegex = new RegExp(
      placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );

    let displayValue = value;
    if (field.type === "signature" || field.type === "initial") {
      if (value.startsWith("data:image/")) {
        displayValue = "[Signed electronically]";
      } else {
        displayValue = value || "[Signed]";
      }
    }
    result = result.replace(placeholderRegex, displayValue);
  }
  return result;
}

// ─── Editor documents → jsPDF ─────────────────────────────────────────

export async function buildSignedPdfFromHtml(opts: {
  html: string;
  signatureFields: SignatureField[];
  fieldValues: Record<string, string>;
  documentTitle: string;
  candidateName: string;
  signedAt: string;
  companyName?: string;
}): Promise<Uint8Array> {
  // 1. Replace signature placeholders with actual values
  const filledHtml = replaceSignaturePlaceholders(
    opts.html,
    opts.signatureFields,
    opts.fieldValues
  );

  // 2. Convert to plain text
  const plainText = htmlToText(filledHtml);

  // 3. Render with jsPDF
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612, H = 792;
  const margin = 50;
  const maxWidth = W - margin * 2;
  let y = margin;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  const titleLines = doc.splitTextToSize(opts.documentTitle, maxWidth);
  for (const line of titleLines) {
    if (y > H - margin) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 22;
  }
  y += 10;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.line(margin, y, W - margin, y);
  y += 20;

  // Body text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  const paragraphs = plainText.split("\n");
  for (const para of paragraphs) {
    if (!para.trim()) { y += 8; continue; }
    const lines = doc.splitTextToSize(para, maxWidth);
    for (const line of lines) {
      if (y > H - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 16;
    }
    y += 4;
  }

  // ─── Signature section ──────────────────────────────────────────────
  y += 30;
  if (y > H - margin - 100) { doc.addPage(); y = margin; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text("Signatures", margin, y);
  y += 20;

  for (const field of opts.signatureFields) {
    const value = opts.fieldValues[field.field_id] || "";
    if (!value) continue;

    if (y > H - margin - 80) { doc.addPage(); y = margin; }

    // Label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(`${field.label}:`, margin, y);
    y += 16;

    // Value
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);

    if ((field.type === "signature" || field.type === "initial") && value.startsWith("data:image/")) {
      // Drawn signature — embed image
      try {
        doc.addImage(value, "PNG", margin, y, 200, 60);
        y += 70;
      } catch {
        doc.text("[Drawn signature]", margin, y);
        y += 16;
      }
    } else {
      doc.text(value, margin, y);
      y += 16;
    }

    // Signature line
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + 250, y);
    y += 24;
  }

  // ─── Audit trail footer ────────────────────────────────────────────
  y += 16;
  if (y > H - margin - 40) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const auditLine1 = `Signed electronically by ${opts.candidateName} on ${new Date(opts.signedAt).toLocaleString("en-US")}`;
  doc.text(auditLine1, margin, y);
  y += 12;
  doc.text("This document was signed using Khetha IQ E-Signature. The signature is legally binding.", margin, y);

  return new Uint8Array(doc.output("arraybuffer"));
}

// ─── Upload documents → pdf-lib overlay ───────────────────────────────

export async function buildSignedPdfFromUpload(opts: {
  pdfBytes: Uint8Array;
  signatureFields: SignatureField[];
  fieldValues: Record<string, string>;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(opts.pdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const field of opts.signatureFields) {
    // Static value fields: render as read-only text (admin-authored content)
    const value = field.static_value || opts.fieldValues[field.field_id] || "";
    if (!value) continue;

    const pageNum = (field.page || 1) - 1;
    const page = pages[pageNum];
    if (!page) continue;

    const { width: pageW, height: pageH } = page.getSize();
    const x = ((field.x || 0) / 100) * pageW;
    const yTop = ((field.y || 0) / 100) * pageH;
    const y = pageH - yTop; // PDF y is from bottom
    const fieldWidth = ((field.width || 30) / 100) * pageW;
    const fieldHeight = ((field.height_pct || 3) / 100) * pageH;
    const yBottom = y - fieldHeight;
    const textSize = Math.max(6, Math.min(18, fieldHeight / 1.15));
    const textBaseline = yBottom + fieldHeight * 0.2;

    if ((field.type === "signature" || field.type === "initial") && value.startsWith("data:image/")) {
      // Drawn signature — embed as image
      try {
        const imgBytes = base64ToUint8Array(value);
        let img;
        try {
          img = await pdfDoc.embedPng(imgBytes);
        } catch {
          img = await pdfDoc.embedJpg(imgBytes);
        }
        const scale = Math.min(fieldWidth / img.width, fieldHeight / img.height);
        const w = img.width * scale, h = img.height * scale;
        page.drawImage(img, {
          x,
          y: yBottom + (fieldHeight - h) / 2,
          width: w,
          height: h,
        });
      } catch {
        // Fall back to text
        page.drawText("[Drawn Signature]", {
          x,
          y: textBaseline,
          size: textSize,
          font,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      // Text value (including static_value)
      page.drawText(value, {
        x,
        y: textBaseline,
        size: textSize,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }

  return await pdfDoc.save();
}

// ─── Base64 helper for email attachments ───────────────────────────────

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}