// PDF text removal — covers placeholder text at signature field positions
// so the signer's signature renders cleanly without the original text showing through.
//
// For each field with x/y coordinates, draws a white rectangle over the
// placeholder text area. This effectively "removes" the text visually in
// the final signed PDF, ensuring the signature is the only content visible
// at that position.

import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";

interface RemovalField {
  page: number;
  x: number;       // percentage 0-100 of page width
  y: number;       // percentage 0-100 of page height (from top)
  width: number;   // percentage 0-100 of page width
  height_pct: number; // percentage 0-100 of page height
}

export async function removeTextFromPdf(
  pdfBytes: Uint8Array,
  fields: RemovalField[]
): Promise<Uint8Array> {
  if (!fields || fields.length === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const pageNum = (field.page || 1) - 1;
    const page = pages[pageNum];
    if (!page) continue;

    const { width: pageW, height: pageH } = page.getSize();
    const x = (field.x / 100) * pageW;
    const yTop = (field.y / 100) * pageH;
    const w = (field.width / 100) * pageW;
    const h = ((field.height_pct || 3) / 100) * pageH;

    // PDF coordinate system: origin at bottom-left, y increases upward.
    // Our field y is from the top, so convert: pdfY = pageH - yTop - h
    page.drawRectangle({
      x,
      y: pageH - yTop - h,
      width: w,
      height: h + 2, // slight padding to fully cover text descenders
      color: rgb(1, 1, 1),
      opacity: 1,
      borderWidth: 0,
    });
  }

  return await pdfDoc.save({ useObjectStreams: true });
}