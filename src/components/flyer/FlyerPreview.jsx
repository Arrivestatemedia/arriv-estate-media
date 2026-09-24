import React, { useRef, useEffect, useState } from "react";
import FlyerTemplate from "./FlyerTemplate";

// Scales the 850×1100 FlyerTemplate to fit the available panel width.
export default function FlyerPreview({ content, templateRef }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(w / 850, 0.6));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 850 * scale, height: 1100 * scale, position: "relative" }}>
        <div style={{ transformOrigin: "top left", transform: `scale(${scale})`, position: "absolute", top: 0, left: 0 }}>
          <FlyerTemplate ref={templateRef} content={content} />
        </div>
      </div>
    </div>
  );
}