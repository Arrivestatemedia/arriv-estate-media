// Shared visual language for the applicant-facing Careers Profile.
// Matches the public job pages (cream reading surface, gold accents, serif headings).

export const GOLD = "#B8956A";
export const GOLD_DARK = "#A68559";
export const TEXT_DARK = "#1A1A1A";
export const CREAM = "#FFFBF5";
export const MUTED = "rgba(26,26,26,0.62)";
export const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export const cardStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
};

export const inputStyle = {
  border: "1px solid rgba(184,149,106,0.3)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  color: TEXT_DARK,
  backgroundColor: "#FFFFFF",
  width: "100%",
  outline: "none",
};

export const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.72)",
  marginBottom: "5px",
  display: "block",
};

export const sectionTitleStyle = {
  ...SERIF,
  fontSize: "19px",
  fontWeight: 700,
  color: TEXT_DARK,
};