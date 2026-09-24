import React, { forwardRef } from "react";
import { Bed, Bath, Ruler, Building, TreePine as Tree, Gem, Home, MapPin } from "lucide-react";

const ICONS = { bed: Bed, bath: Bath, ruler: Ruler, building: Building, tree: Tree, diamond: Gem, home: Home, pin: MapPin };

const GOLD = "#d4af37";
const SIDEBAR = "#1a1a1a";
const BODY = "#f5f2ed";

function Icon({ name, size = 18, color = GOLD }) {
  const Cmp = ICONS[name] || Gem;
  return <Cmp size={size} color={color} strokeWidth={1.5} />;
}

// The LUXURY_ESTATE flyer template — fixed 850×1100px portrait. Pure render
// from a `content` prop. Rendered full-size for PDF export and scaled by the
// preview wrapper. Only depends on lucide-react.
const FlyerTemplate = forwardRef(({ content = {} }, ref) => {
  const c = content;
  const features = (c.features || []).slice(0, 3);
  const stats = (c.stats || []).slice(0, 5);
  const gallery = (c.gallery_images || []).slice(0, 2);

  return (
    <div ref={ref} style={{
      width: 850, height: 1100, background: BODY, display: "flex", flexDirection: "column",
      fontFamily: "'Montserrat', sans-serif", color: "#222", position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left sidebar */}
        <div style={{ width: 300, background: SIDEBAR, color: "#fff", padding: "40px 32px", display: "flex", flexDirection: "column" }}>
          {c.eyebrow ? <div style={{ color: GOLD, fontSize: 11, letterSpacing: 3, fontWeight: 600, marginBottom: 12 }}>{c.eyebrow}</div> : null}
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 36, lineHeight: 1.1, marginBottom: 14 }}>{c.headline || ""}</div>
          {c.subheadline ? <div style={{ fontStyle: "italic", color: GOLD, fontSize: 14, marginBottom: 18 }}>{c.subheadline}</div> : null}
          {c.body_text ? <div style={{ fontSize: 12, lineHeight: 1.6, color: "#ccc", marginBottom: 24 }}>{c.body_text}</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid ${GOLD}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={f.icon} size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#fff", marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.5, color: "#999" }}>{f.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div style={{ width: 550, display: "flex", flexDirection: "column", padding: 32, gap: 20 }}>
          {/* Hero */}
          <div style={{ position: "relative", height: 320, borderRadius: 4, overflow: "hidden", background: "#e0dccc" }}>
            {c.hero_image
              ? <img src={c.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 13 }}>Hero Image</div>}
            {c.hero_callout ? (
              <div style={{ position: "absolute", right: 16, bottom: 16, background: GOLD, color: "#1a1a1a", padding: "12px 16px", fontSize: 12, fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-line", borderRadius: 2 }}>
                {c.hero_callout}
              </div>
            ) : null}
          </div>

          {/* Stats strip */}
          <div style={{ display: "flex", background: "#fff", border: `1px solid ${GOLD}33`, borderRadius: 4, minHeight: 64 }}>
            {stats.length === 0
              ? <div style={{ flex: 1, padding: "18px", textAlign: "center", color: "#bbb", fontSize: 12 }}>Stats Strip</div>
              : stats.map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: "14px 6px", textAlign: "center", borderRight: i < stats.length - 1 ? `1px solid ${GOLD}22` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><Icon name={s.icon} size={16} /></div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "'Playfair Display', serif" }}>{s.value}</div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#888" }}>{s.label}</div>
                  </div>
                ))}
          </div>

          {/* Gallery */}
          <div style={{ display: "flex", gap: 12, height: 150 }}>
            {(gallery.length === 0 ? ["", ""] : gallery).map((g, i) => (
              <div key={i} style={{ flex: 1, borderRadius: 4, overflow: "hidden", background: "#e0dccc" }}>
                {g ? <img src={g} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                   : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 12 }}>Gallery {i + 1}</div>}
              </div>
            ))}
          </div>

          {/* Agent footer */}
          <div style={{ marginTop: "auto", background: SIDEBAR, color: "#fff", borderRadius: 4, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", background: "#333", flexShrink: 0 }}>
              {c.agent_headshot ? <img src={c.agent_headshot} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.agent_name || "Agent Name"}</div>
              {c.agent_title ? <div style={{ fontSize: 11, color: GOLD, marginBottom: 4 }}>{c.agent_title}</div> : null}
              <div style={{ fontSize: 11, color: "#ccc" }}>{c.agent_phone}{c.agent_office_phone ? `  ·  ${c.agent_office_phone}` : ""}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {c.company_logo
                ? <img src={c.company_logo} alt="" style={{ maxHeight: 44, maxWidth: 120, objectFit: "contain" }} />
                : (c.company_name ? <div style={{ fontSize: 11, color: "#ccc", textAlign: "right" }}>{c.company_name}</div> : null)}
            </div>
          </div>
        </div>
      </div>

      {/* Tagline */}
      <div style={{ background: SIDEBAR, borderTop: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}`, padding: "18px 24px", textAlign: "center", color: GOLD, fontFamily: "'Playfair Display', serif", fontSize: 16, letterSpacing: 2, fontWeight: 700 }}>
        {c.tagline || ""}
      </div>
    </div>
  );
});

FlyerTemplate.displayName = "FlyerTemplate";
export default FlyerTemplate;