import React from "react";
import { cardStyle, GOLD, MUTED, sectionTitleStyle } from "./careersStyles";

/** A white card with a serif title and optional supporting line. */
export default function ProfileSection({ title, subtitle, children, icon: Icon }) {
  return (
    <section style={cardStyle} className="p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        {Icon && <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: GOLD }} />}
        <div>
          <h2 style={sectionTitleStyle}>{title}</h2>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: MUTED }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}