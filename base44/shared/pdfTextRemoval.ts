// Physically removes the text that sits under each signing field from the
// PDF content stream. Works by POSITION, not string matching: every glyph
// whose centre falls inside a field box is dropped from its Tj/TJ operator,
// and its advance width is replaced with a TJ spacing adjustment so the rest
// of the line stays exactly where it was. The text is gone from the content
// stream — not covered by a white rectangle.

import {
  PDFDocument, PDFName, PDFArray, PDFDict, PDFNumber, PDFStream, PDFRawStream, decodePDFRawStream,
} from "npm:pdf-lib@1.17.1";
import { Font as StandardFont, Encodings } from "npm:@pdf-lib/standard-fonts@1.0.0";

interface RemovalField { page: number; x: number; y: number; width: number; height_pct: number; }
type Mat = [number, number, number, number, number, number];
interface Box { left: number; right: number; bottom: number; top: number; }
interface FontInfo { twoByte: boolean; width: (code: number) => number; }
type Obj =
  | { kind: "num"; start: number; end: number; value: number }
  | { kind: "str"; start: number; end: number; bytes: number[] }
  | { kind: "arr"; start: number; end: number; items: Obj[] }
  | { kind: "op"; start: number; end: number; value: string }
  | { kind: "other"; start: number; end: number };

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];
const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const applyPt = (m: Mat, x: number, y: number) => [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
const translate = (tx: number, ty: number): Mat => [1, 0, 0, 1, tx, ty];
const isWs = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t" || c === "\f" || c === "\0";
const isDelim = (c: string) => "()<>[]{}/%".includes(c);
const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(3));
const toHex = (bytes: number[]) => "<" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("") + ">";
const num = (o: unknown) => (o instanceof PDFNumber ? o.asNumber() : 0);

// ─── Content stream tokenizer ─────────────────────────────────────────

class ContentParser {
  s: string;
  i = 0;
  constructor(s: string) { this.s = s; }

  skipWs() {
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i];
      if (isWs(c)) this.i++;
      else if (c === "%") { while (this.i < s.length && s[this.i] !== "\n" && s[this.i] !== "\r") this.i++; }
      else break;
    }
  }

  next(): Obj | null {
    this.skipWs();
    const s = this.s;
    const start = this.i;
    if (start >= s.length) return null;
    const c = s[start];
    if (c === "(") return this.literal();
    if (c === "<" && s[start + 1] === "<") return this.dict();
    if (c === "<") return this.hex();
    if (c === "[") return this.array();
    if (c === "/") {
      this.i++;
      while (this.i < s.length && !isWs(s[this.i]) && !isDelim(s[this.i])) this.i++;
      return { kind: "other", start, end: this.i };
    }
    if (isDelim(c)) { this.i++; return { kind: "other", start, end: this.i }; }
    while (this.i < s.length && !isWs(s[this.i]) && !isDelim(s[this.i])) this.i++;
    const tok = s.slice(start, this.i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return { kind: "num", start, end: this.i, value: parseFloat(tok) };
    if (tok === "true" || tok === "false" || tok === "null") return { kind: "other", start, end: this.i };
    return { kind: "op", start, end: this.i, value: tok };
  }

  literal(): Obj {
    const s = this.s;
    const start = this.i++;
    const bytes: number[] = [];
    let depth = 1;
    while (this.i < s.length) {
      const c = s[this.i++];
      if (c === "\\") {
        const n = s[this.i++];
        if (n === undefined) break;
        if (n === "n") bytes.push(10);
        else if (n === "r") bytes.push(13);
        else if (n === "t") bytes.push(9);
        else if (n === "b") bytes.push(8);
        else if (n === "f") bytes.push(12);
        else if (n === "\r") { if (s[this.i] === "\n") this.i++; }
        else if (n === "\n") { /* line continuation */ }
        else if (n >= "0" && n <= "7") {
          let oct = n;
          while (oct.length < 3 && s[this.i] >= "0" && s[this.i] <= "7") oct += s[this.i++];
          bytes.push(parseInt(oct, 8) & 0xff);
        } else bytes.push(n.charCodeAt(0) & 0xff);
      } else if (c === "(") { depth++; bytes.push(40); }
      else if (c === ")") { depth--; if (depth === 0) break; bytes.push(41); }
      else bytes.push(c.charCodeAt(0) & 0xff);
    }
    return { kind: "str", start, end: this.i, bytes };
  }

  hex(): Obj {
    const s = this.s;
    const start = this.i++;
    let hex = "";
    while (this.i < s.length && s[this.i] !== ">") { if (!isWs(s[this.i])) hex += s[this.i]; this.i++; }
    this.i++;
    if (hex.length % 2) hex += "0";
    const bytes: number[] = [];
    for (let k = 0; k < hex.length; k += 2) bytes.push(parseInt(hex.slice(k, k + 2), 16) || 0);
    return { kind: "str", start, end: this.i, bytes };
  }

  array(): Obj {
    const start = this.i++;
    const items: Obj[] = [];
    while (true) {
      this.skipWs();
      if (this.i >= this.s.length) break;
      if (this.s[this.i] === "]") { this.i++; break; }
      const o = this.next();
      if (!o) break;
      items.push(o);
    }
    return { kind: "arr", start, end: this.i, items };
  }

  dict(): Obj {
    const start = this.i;
    this.i += 2;
    while (true) {
      this.skipWs();
      if (this.i >= this.s.length) break;
      if (this.s[this.i] === ">" && this.s[this.i + 1] === ">") { this.i += 2; break; }
      if (!this.next()) break;
    }
    return { kind: "other", start, end: this.i };
  }

  // Called right after BI: skip key/value pairs to ID, then binary data to EI.
  skipInlineImage() {
    while (true) {
      const o = this.next();
      if (!o) return;
      if (o.kind === "op" && o.value === "ID") break;
    }
    this.i++;
    const s = this.s;
    while (this.i < s.length) {
      if (s[this.i] === "E" && s[this.i + 1] === "I" && isWs(s[this.i - 1] || " ") &&
          (this.i + 2 >= s.length || isWs(s[this.i + 2]))) { this.i += 2; return; }
      this.i++;
    }
  }
}

// ─── Font widths (for glyph-accurate positioning) ─────────────────────

const STANDARD_ALIASES: Record<string, string> = {
  Arial: "Helvetica", "Arial,Bold": "Helvetica-Bold", "Arial-BoldMT": "Helvetica-Bold", ArialMT: "Helvetica",
  Times: "Times-Roman", TimesNewRoman: "Times-Roman", TimesNewRomanPSMT: "Times-Roman",
  "TimesNewRoman,Bold": "Times-Bold", "TimesNewRomanPS-BoldMT": "Times-Bold", CourierNew: "Courier",
};

// Standard-14 fonts (what jsPDF and pdf-lib emit) carry no /Widths array —
// use the built-in AFM metrics instead.
function standardFontWidths(font: PDFDict): ((code: number) => number) | null {
  const baseFont = font.lookup(PDFName.of("BaseFont"))?.toString().replace(/^\//, "").replace(/^[A-Z]{6}\+/, "") || "";
  const name = STANDARD_ALIASES[baseFont] || baseFont;
  if (name === "Symbol" || name === "ZapfDingbats") return null;
  let std: StandardFont;
  try { std = StandardFont.load(name as never); } catch { return null; }
  const cache = new Map<number, number>();
  return (code) => {
    if (cache.has(code)) return cache.get(code)!;
    let w = 500;
    try {
      const glyph = Encodings.WinAnsi.encodeUnicodeCodePoint(code).name;
      w = std.getWidthOfGlyph(glyph) ?? 500;
    } catch { /* unmapped code */ }
    cache.set(code, w);
    return w;
  };
}

function loadFont(fonts: PDFDict | undefined, name: string): FontInfo {
  const fallback: FontInfo = { twoByte: false, width: () => 500 };
  const font = fonts?.lookup(PDFName.of(name));
  if (!(font instanceof PDFDict)) return fallback;

  if (font.lookup(PDFName.of("Subtype"))?.toString() === "/Type0") {
    const descendants = font.lookup(PDFName.of("DescendantFonts"));
    const cid = descendants instanceof PDFArray ? descendants.lookup(0) : undefined;
    let dw = 1000;
    const single = new Map<number, number>();
    const ranges: Array<[number, number, number]> = [];
    if (cid instanceof PDFDict) {
      const dwObj = cid.lookup(PDFName.of("DW"));
      if (dwObj instanceof PDFNumber) dw = dwObj.asNumber();
      const W = cid.lookup(PDFName.of("W"));
      if (W instanceof PDFArray) {
        let k = 0;
        while (k < W.size()) {
          const first = num(W.lookup(k));
          const second = W.lookup(k + 1);
          if (second instanceof PDFArray) {
            for (let m = 0; m < second.size(); m++) single.set(first + m, num(second.lookup(m)));
            k += 2;
          } else {
            ranges.push([first, num(second), num(W.lookup(k + 2))]);
            k += 3;
          }
        }
      }
    }
    return {
      twoByte: true,
      width: (code) => {
        if (single.has(code)) return single.get(code)!;
        for (const [a, b, w] of ranges) if (code >= a && code <= b) return w;
        return dw;
      },
    };
  }

  const widths = font.lookup(PDFName.of("Widths"));
  if (!(widths instanceof PDFArray)) {
    const std = standardFontWidths(font);
    return std ? { twoByte: false, width: std } : fallback;
  }
  const firstChar = num(font.lookup(PDFName.of("FirstChar")));
  const descriptor = font.lookup(PDFName.of("FontDescriptor"));
  const missing = descriptor instanceof PDFDict ? num(descriptor.lookup(PDFName.of("MissingWidth"))) : 0;
  return {
    twoByte: false,
    width: (code) => {
      const idx = code - firstChar;
      if (idx >= 0 && idx < widths.size()) {
        const w = widths.lookup(idx);
        if (w instanceof PDFNumber) return w.asNumber();
      }
      return missing || 500;
    },
  };
}

// ─── Page content rewriting ───────────────────────────────────────────

function cleanPageContent(content: string, boxes: Box[], fonts: PDFDict | undefined, tolX: number, tolY: number): string | null {
  const p = new ContentParser(content);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const fontCache = new Map<string, FontInfo>();
  type GState = { ctm: Mat; font: FontInfo; size: number; tc: number; tw: number; th: number; tl: number; rise: number };
  let gs: GState = { ctm: IDENTITY, font: { twoByte: false, width: () => 500 }, size: 0, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 };
  const stack: GState[] = [];
  let tm: Mat = IDENTITY;
  let tlm: Mat = IDENTITY;
  let operands: Obj[] = [];

  const inBox = (x: number, y: number) =>
    boxes.some((b) => x >= b.left - tolX && x <= b.right + tolX && y >= b.bottom - tolY && y <= b.top + tolY);
  const nextLine = (tx: number, ty: number) => { tlm = mul(translate(tx, ty), tlm); tm = tlm; };
  const spacing = (gap: number) => fmt(-(gap / (gs.size * gs.th)) * 1000);

  // Shows one string, returning TJ items (kept bytes + spacing for removed glyphs).
  const show = (bytes: number[]) => {
    const items: string[] = [];
    let kept: number[] = [];
    let gap = 0;
    let removed = false;
    const step = gs.font.twoByte ? 2 : 1;
    const canRemove = gs.size > 0 && gs.th > 0;
    for (let k = 0; k < bytes.length; k += step) {
      const codeBytes = bytes.slice(k, k + step);
      const code = codeBytes.length === 2 ? (codeBytes[0] << 8) | codeBytes[1] : codeBytes[0];
      const tx = ((gs.font.width(code) / 1000) * gs.size + gs.tc + (step === 1 && code === 32 ? gs.tw : 0)) * gs.th;
      const [cx, cy] = applyPt(mul(tm, gs.ctm), tx / 2, gs.rise + gs.size * 0.3);
      if (canRemove && inBox(cx, cy)) {
        removed = true;
        if (kept.length) { items.push(toHex(kept)); kept = []; }
        gap += tx;
      } else {
        if (gap) { items.push(spacing(gap)); gap = 0; }
        kept.push(...codeBytes);
      }
      tm = mul(translate(tx, 0), tm);
    }
    if (kept.length) items.push(toHex(kept));
    if (gap) items.push(spacing(gap));
    return { items, removed };
  };

  while (true) {
    const o = p.next();
    if (!o) break;
    if (o.kind !== "op") { operands.push(o); continue; }
    const op = o.value;
    const nums = operands.map((x) => (x.kind === "num" ? x.value : 0));
    const last = operands[operands.length - 1];

    switch (op) {
      case "q": stack.push({ ...gs }); break;
      case "Q": if (stack.length) gs = stack.pop()!; break;
      case "cm": if (nums.length >= 6) gs.ctm = mul(nums.slice(-6) as Mat, gs.ctm); break;
      case "BT": tm = IDENTITY; tlm = IDENTITY; break;
      case "Tf": {
        const nameObj = operands[operands.length - 2];
        const name = nameObj ? content.slice(nameObj.start + 1, nameObj.end) : "";
        if (!fontCache.has(name)) fontCache.set(name, loadFont(fonts, name));
        gs.font = fontCache.get(name)!;
        gs.size = nums[nums.length - 1] || 0;
        break;
      }
      case "Tc": gs.tc = nums[0] ?? 0; break;
      case "Tw": gs.tw = nums[0] ?? 0; break;
      case "Tz": gs.th = (nums[0] ?? 100) / 100; break;
      case "TL": gs.tl = nums[0] ?? 0; break;
      case "Ts": gs.rise = nums[0] ?? 0; break;
      case "Td": nextLine(nums[0] ?? 0, nums[1] ?? 0); break;
      case "TD": gs.tl = -(nums[1] ?? 0); nextLine(nums[0] ?? 0, nums[1] ?? 0); break;
      case "Tm": if (nums.length >= 6) { tm = nums.slice(-6) as Mat; tlm = tm; } break;
      case "T*": nextLine(0, -gs.tl); break;
      case "Tj": case "'": case "\"": {
        if (op === "\"") { gs.tw = nums[0] ?? 0; gs.tc = nums[1] ?? 0; }
        if (op !== "Tj") nextLine(0, -gs.tl);
        if (last?.kind !== "str") break;
        const r = show(last.bytes);
        if (r.removed) {
          const prefix = op === "\"" ? `${fmt(gs.tw)} Tw ${fmt(gs.tc)} Tc T* ` : op === "'" ? "T* " : "";
          edits.push({ start: operands[0].start, end: o.end, text: `${prefix}[${r.items.join(" ")}] TJ` });
        }
        break;
      }
      case "TJ": {
        if (last?.kind !== "arr") break;
        const out: string[] = [];
        let removed = false;
        for (const it of last.items) {
          if (it.kind === "str") {
            const r = show(it.bytes);
            out.push(...r.items);
            removed = removed || r.removed;
          } else if (it.kind === "num") {
            tm = mul(translate((-it.value / 1000) * gs.size * gs.th, 0), tm);
            out.push(fmt(it.value));
          }
        }
        if (removed) edits.push({ start: last.start, end: o.end, text: `[${out.join(" ")}] TJ` });
        break;
      }
      case "BI": p.skipInlineImage(); break;
    }
    operands = [];
  }

  if (!edits.length) return null;
  edits.sort((a, b) => b.start - a.start);
  let out = content;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

// ─── Stream helpers ───────────────────────────────────────────────────

function bytesToLatin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

function latin1ToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

// deno-lint-ignore no-explicit-any
function readPageContent(page: any): string | null {
  const contents = page.node.Contents();
  const list: PDFStream[] = [];
  if (contents instanceof PDFArray) {
    for (let k = 0; k < contents.size(); k++) {
      const s = contents.lookup(k);
      if (s instanceof PDFStream) list.push(s);
    }
  } else if (contents instanceof PDFStream) list.push(contents);
  if (!list.length) return null;
  try {
    return list
      // deno-lint-ignore no-explicit-any
      .map((s) => bytesToLatin1(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : (s as any).getUnencodedContents()))
      .join("\n");
  } catch (e) {
    console.error("Could not decode page content stream:", (e as Error).message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export async function removeTextFromPdf(pdfBytes: Uint8Array, fields: RemovalField[]): Promise<Uint8Array> {
  if (!fields || fields.length === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  let changed = false;

  pdfDoc.getPages().forEach((page, idx) => {
    const pageFields = fields.filter((f) => (f.page || 1) === idx + 1);
    if (!pageFields.length) return;
    if (page.getRotation().angle % 360 !== 0) return; // rotated pages are skipped

    const cb = page.getCropBox();
    const boxes: Box[] = pageFields.map((f) => {
      const left = cb.x + (f.x / 100) * cb.width;
      const top = cb.y + cb.height - (f.y / 100) * cb.height;
      return {
        left,
        right: left + ((f.width || 30) / 100) * cb.width,
        top,
        bottom: top - ((f.height_pct || 3) / 100) * cb.height,
      };
    });

    const content = readPageContent(page);
    if (content === null) return;
    const fontsObj = page.node.Resources()?.lookup(PDFName.of("Font"));
    const fonts = fontsObj instanceof PDFDict ? fontsObj : undefined;

    const cleaned = cleanPageContent(content, boxes, fonts, cb.width * 0.006, cb.height * 0.004);
    if (cleaned === null) return;

    const stream = pdfDoc.context.flateStream(latin1ToBytes(cleaned));
    page.node.set(PDFName.of("Contents"), pdfDoc.context.register(stream));
    changed = true;
  });

  return changed ? await pdfDoc.save() : pdfBytes;
}