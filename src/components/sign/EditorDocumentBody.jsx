import React, { useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { parseInlineFields } from "@/lib/signInlineFields";
import InlineEditorField from "@/components/sign/InlineEditorField";

// Renders the merged editor HTML intact, then mounts each signing field into
// its placeholder slot so the document's own structure is preserved.
export default function EditorDocumentBody({ html, values, onChange, missingIds }) {
  const { html: slotted, placements } = useMemo(() => parseInlineFields(html), [html]);
  const ref = useRef(null);
  const [slots, setSlots] = useState([]);

  useLayoutEffect(() => {
    setSlots(Array.from(ref.current?.querySelectorAll("[data-sign-slot]") || []));
  }, [slotted]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm">
      <div ref={ref} className="prose prose-sm max-w-none text-[#1A1A1A]" dangerouslySetInnerHTML={{ __html: slotted }} />
      {slots.map((el, i) => {
        const field = placements[Number(el.dataset.signSlot)];
        if (!field) return null;
        return createPortal(
          <InlineEditorField
            field={field}
            value={values[field.field_id] || ""}
            missing={missingIds.has(field.field_id)}
            onChange={(v) => onChange(field.field_id, v)}
          />,
          el,
          `slot-${i}`
        );
      })}
    </div>
  );
}