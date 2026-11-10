import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * A list that shows only its most recent entries until the customer asks for the rest.
 *
 * Expanded, the list itself becomes the scroll area (not the page), so a long history
 * never pushes the rest of the dashboard further down.
 */
export default function CollapsibleList({
  items = [],
  initialCount = 3,
  expandLabel = "Show all",
  collapseLabel = "Show fewer",
  listClassName = "",
  expandedListClassName = "max-h-[26rem] overflow-y-auto overscroll-contain pr-1",
  renderItem,
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const visible = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      <div className={`${listClassName} ${expanded && hasMore ? expandedListClassName : ""}`}>
        {visible.map(renderItem)}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#B8956A]/40 px-3 py-1.5 text-xs font-semibold text-[#1A1A1A]/75 hover:bg-[#B8956A]/10 hover:text-[#1A1A1A]"
        >
          {expanded ? collapseLabel : `${expandLabel} (${items.length})`}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      )}
    </>
  );
}