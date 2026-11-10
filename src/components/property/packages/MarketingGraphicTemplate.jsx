import React, { forwardRef } from "react";

// The graphic itself, drawn at its exact export size.
//
// Inline styles are deliberate here: this node is rasterised by html2canvas into a downloadable
// PNG, so it needs real pixel dimensions and the brand's exact hex values rather than responsive
// utility classes. Everything printed on it comes from the customer's approved listing content.
const MarketingGraphicTemplate = forwardRef(function MarketingGraphicTemplate({ spec }, ref) {
  const { width, height, layout } = spec;
  const compact = layout === "landscape";
  const tall = layout === "story";

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0a0b0f",
        color: "#FFFBF5",
        fontFamily: "Georgia, 'Times New Roman', serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {spec.cover_url ? (
        <img
          src={spec.cover_url}
          alt=""
          crossOrigin="anonymous"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(10,11,15,0.15) 0%, rgba(10,11,15,0.55) 52%, rgba(10,11,15,0.94) 100%)",
        }}
      />

      <div style={{ position: "relative", padding: tall ? "0 72px 120px" : compact ? "0 56px 52px" : "0 72px 84px" }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #c9a87b, #b8956a)",
            color: "#0a0b0f",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: tall ? 26 : compact ? 18 : 22,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginBottom: tall ? 36 : compact ? 18 : 26,
          }}
        >
          {spec.badge}
        </div>

        <div
          style={{
            fontSize: tall ? 76 : compact ? 44 : 62,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
            fontWeight: 400,
            maxWidth: "90%",
          }}
        >
          {spec.headline}
        </div>

        {spec.subheadline ? (
          <div
            style={{
              marginTop: 14,
              fontFamily: "Helvetica, Arial, sans-serif",
              fontSize: tall ? 34 : compact ? 22 : 28,
              color: "rgba(255,251,245,0.7)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {spec.subheadline}
          </div>
        ) : null}

        <div style={{ marginTop: compact ? 18 : 28, display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap" }}>
          {spec.price_line ? (
            <span style={{ fontSize: tall ? 64 : compact ? 38 : 52, fontWeight: 400 }}>{spec.price_line}</span>
          ) : null}
          {spec.facts_line ? (
            <span
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontSize: tall ? 26 : compact ? 18 : 22,
                color: "rgba(255,251,245,0.62)",
              }}
            >
              {spec.facts_line}
            </span>
          ) : null}
        </div>

        {spec.credit_line ? (
          <div
            style={{
              marginTop: 20,
              fontFamily: "Helvetica, Arial, sans-serif",
              fontSize: tall ? 26 : compact ? 18 : 22,
              color: "rgba(255,251,245,0.62)",
            }}
          >
            {spec.credit_line}
          </div>
        ) : null}

        <div
          style={{
            marginTop: tall ? 60 : compact ? 26 : 40,
            borderTop: "1px solid rgba(184,149,106,0.4)",
            paddingTop: 18,
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: tall ? 22 : compact ? 14 : 18,
            color: "rgba(255,251,245,0.45)",
          }}
        >
          <span>{spec.footer}</span>
          <span>{spec.disclosure}</span>
        </div>
      </div>
    </div>
  );
});

export default MarketingGraphicTemplate;