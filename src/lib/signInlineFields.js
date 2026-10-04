const FIELD_RE = /\{\{(sig|date|name|text|initial):([^}]+)\}\}/g;
const TYPE_MAP = { sig: "signature", date: "date", name: "name", text: "text", initial: "initial" };

// Parses {{sig:Label}}, {{date:Label}}, {{name:Label}}, {{text:Label}},
// {{initial:Label}} from merged editor HTML. Returns the HTML with each
// placeholder replaced by an empty slot, the field for each slot (in order),
// and the de-duplicated field list. field_id = label lowercased, spaces→_.
export function parseInlineFields(html) {
  const placements = [];
  const fields = [];
  const seen = new Set();
  const slotted = (html || "").replace(FIELD_RE, (_m, kind, rawLabel) => {
    const label = rawLabel.trim();
    const field = { field_id: label.toLowerCase().replace(/\s+/g, "_"), type: TYPE_MAP[kind], label, required: true };
    placements.push(field);
    if (!seen.has(field.field_id)) {
      seen.add(field.field_id);
      fields.push(field);
    }
    return `<span data-sign-slot="${placements.length - 1}"></span>`;
  });
  return { html: slotted, placements, fields };
}