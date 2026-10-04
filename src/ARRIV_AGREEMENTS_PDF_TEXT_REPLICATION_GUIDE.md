# PDF Placeholder-Text Removal — Replication Guide

How Arriv Estate Media physically scrubs placeholder text (e.g. `[DATE]`,
`{{name}}`) from an uploaded PDF **before** it is sent to a signer, including
the case where a long placeholder wraps to the next line.

This is the single source of truth. Other apps (Arriv One, KhethaIQ, etc.)
should copy the two files below and wire the cleaning step exactly as shown.

---

## 1. What it does

When an admin places a signature field over a placeholder token in an uploaded
PDF, the token text is removed from the PDF content stream at **send time** —
not covered by a white rectangle, not masked. The signer sees a clean field
where they type/draw their value; the value is burned into the final signed PDF
on submission.

Removal is **positional** (every glyph whose centre falls inside the field box
is dropped) plus **bracket-aware continuation**: if the removed glyphs open a
`[` or `{{` that never closes inside the box, the remover keeps stripping
glyphs on the following line(s) until the matching `]` / `}}` is found. This
handles placeholders that wrap across lines.

---

## 2. Files to copy

### `base44/shared/pdfTextRemoval.ts`

Copy this file verbatim. It has zero app-specific dependencies — only
`pdf-lib` and `@pdf-lib/standard-fonts` (both already available in the Deno
backend runtime via `npm:` imports).

Public API:

```ts
export async function removeTextFromPdf(
  pdfBytes: Uint8Array,
  fields: RemovalField[]
): Promise<Uint8Array>

interface RemovalField {
  page: number;       // 1-indexed
  x: number;          // % of page width (0-100)
  y: number;          // % of page height from top (0-100)
  width: number;      // % of page width (default 30)
  height_pct: number; // % of page height (default 3)
}
```

Coordinates are **percentages of the page**, with `y` measured from the **top**
edge (matching how a field placer renders boxes over the page). The function
converts them to PDF user-space internally.

The full file lives at `base44/shared/pdfTextRemoval.ts` in this app. The
bracket-aware logic is the `cont` state + `checkUnclosed` + `endsWith` block
inside `cleanPageContent`, and the `show()` function's continuation branch.
Do not modify these unless you know what you're doing.

### Field schema (on your SignDocument entity)

Each signature field must store:

```jsonc
{
  "field_id": "string",
  "type": "signature" | "date" | "name" | "text" | "initial",
  "x": 12.3,            // % from left
  "y": 45.6,            // % from top
  "page": 1,
  "width": 30,          // % of page width
  "height_pct": 3,      // % of page height
  "placeholder_text": "string"  // the text under the box (audit/debug only)
}
```

`x`/`y`/`page`/`width`/`height_pct` are what the remover reads. The other
fields are for the signer UI and the final signed-PDF burn-in.

---

## 3. Wiring: clean the PDF at send time

In your `sendSignRequest` backend function, **after** creating the
SignRequest(s) and **before** the signer sees the document, run the cleaning
step. The cleaned PDF is stored as a private file and its `file_uri` is saved
onto the SignRequest as `cleaned_body_ref`. The signer preview and the final
signed-PDF generation both read from `cleaned_body_ref` (falling back to
`body_ref` if empty).

```ts
import { removeTextFromPdf } from '../../shared/pdfTextRemoval.ts';

// ... inside sendSignRequest, after results[] is populated ...

if (doc.source_type === "upload" && doc.body_ref && results.length > 0) {
  const placedFields = (doc.signature_fields || []).filter(
    f => typeof f.x === "number" && typeof f.y === "number"
  );
  if (placedFields.length > 0) {
    try {
      // 1. Get a temporary signed URL to download the original private PDF.
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: doc.body_ref,
        expires_in: 300,
      });
      if (signed?.signed_url) {
        // 2. Download + clean.
        const pdfRes = await fetch(signed.signed_url);
        const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        const cleanedBytes = await removeTextFromPdf(
          pdfBytes,
          placedFields.map(f => ({
            page: f.page || 1,
            x: f.x,
            y: f.y,
            width: f.width || 30,
            height_pct: f.height_pct || 3,
          }))
        );
        // 3. Upload the cleaned PDF to private storage.
        const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
          file: new File([cleanedBytes], `cleaned-${doc.document_id}.pdf`, { type: "application/pdf" }),
        });
        const cleanedUri = uploadRes?.file_uri || "";
        // 4. Point every SignRequest at the cleaned PDF.
        if (cleanedUri) {
          for (const result of results) {
            await base44.asServiceRole.entities.SignRequest.update(result.signRequest.id, {
              cleaned_body_ref: cleanedUri,
            });
          }
        }
      }
    } catch (e) {
      console.error("PDF text removal failed:", e.message);
      // Non-fatal: signer falls back to the original body_ref.
    }
  }
}
```

Key points:
- Only `source_type === "upload"` documents need cleaning. Editor-created
  docs render their own HTML and have no PDF placeholder text.
- The cleaning is **non-fatal** — if it fails, the signer still gets the
  original `body_ref`. Never block sending on a cleaning error.
- One cleaned PDF per document is shared across all signers in a multi-signer
  send (the placeholder removal is the same for everyone).

---

## 4. Frontend: the field placer

The admin places fields by clicking on a rendered PDF page. Use `pdf.js` to
render pages and extract text tokens, then snap the click to the nearest
token. Reference implementation: `src/lib/pdfRender.js` (this app) —
specifically:

- `extractTextItems(textContent, viewport)` — splits pdf.js text items into
  per-token bounding boxes (percentages of the page).
- `findSnapTarget(tokens, clickX, clickY, pageW, pageH)` — returns the token
  under or nearest the click.
- `textInsideBox(tokens, f)` — returns the placeholder text string that sits
  inside a field box (store this as `placeholder_text` for audit).

The placer stores `x`/`y`/`width`/`height_pct` as percentages so they're
resolution-independent and match what `removeTextFromPdf` expects.

---

## 5. Signer preview + final signed PDF

- **Signer preview**: render `cleaned_body_ref` (or `body_ref`) with pdf.js
  and overlay interactive fields at their `x`/`y` positions. Because the
  placeholder text was already scrubbed, the signer sees only the field boxes.
- **Final signed PDF**: on submission, take the cleaned PDF bytes, overlay the
  signer's values (typed text or drawn signature image) at each field's
  position, and store the result as the signed PDF. Reference:
  `base44/shared/signedDocumentPdf.ts` in this app.

---

## 6. Gotchas

- **Rotated pages**: `removeTextFromPdf` skips pages with non-zero rotation
  (coordinate math doesn't hold). Flag rotated pages in the placer UI so the
  admin knows to rotate the source PDF first.
- **Standard-14 fonts** (Helvetica, Times, Courier — what jsPDF and pdf-lib
  emit) carry no `/Widths` array; the remover falls back to built-in AFM
  metrics via `@pdf-lib/standard-fonts`. Embedded subset fonts use their
  `/Widths` array. CJK (Type0/Identity-H) uses the CID `/W` array.
- **Bracket detection** only triggers for `[...]` and `{{...}}`. Underscore
  runs (`____`) have no closing delimiter and are not continued across lines
  — if you need that, add a third continuation type with a sentinel.
- **Tolerance**: the remover uses `cb.width * 0.006` horizontal and
  `cb.height * 0.004` vertical tolerance around each box. Tune only if fields
  are consistently off.
- **Idempotency**: cleaning runs once per send. If you re-send, a fresh
  cleaned PDF is generated from the original `body_ref` (never re-clean an
  already-cleaned PDF — the brackets are gone).

---

## 7. Minimal test

```ts
// Create a PDF where "[VERY_LONG_PLACEHOLDER" wraps to "VALUE]" on line 2.
const doc = await PDFDocument.create();
const page = doc.addPage([612, 792]);
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText("Sign here: [VERY_LONG_PLACEHOLDER", { x: 72, y: 700, size: 12, font });
page.drawText("VALUE] and keep this", { x: 72, y: 684, size: 12, font });
const bytes = await doc.save();

// Box covers only line 1's "[VERY_LONG_PLACEHOLDER".
const cleaned = await removeTextFromPdf(bytes, [{
  page: 1,
  x: ((72 + font.widthOfTextAtSize("Sign here: ", 12)) / 612) * 100,
  y: ((792 - 700 - 12) / 792) * 100,
  width: (font.widthOfTextAtSize("[VERY_LONG_PLACEHOLDER", 12) / 612) * 100,
  height_pct: (12 / 792) * 100,
}]);

// Assert: "VALUE]" is gone, "keep this" and "Sign here:" survive.
``