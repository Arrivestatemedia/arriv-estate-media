export const APPLICATION_STATUSES = [
  { value: "received", label: "Application Received", color: "#B8956A" },
  { value: "reviewing", label: "Under Review", color: "#3b82f6" },
  { value: "accepted", label: "Accepted to Platform", color: "#10b981" },
  { value: "accepted_waitlist", label: "Accepted - Waitlist", color: "#f59e0b" },
  { value: "denied", label: "Launch Full - Application Closed", color: "#ef4444" },
];

export const SALES_STATUSES = [
  { value: "received", label: "Application Received", color: "#B8956A" },
  { value: "under_review", label: "Under Review", color: "#3b82f6" },
  { value: "interview_invitation", label: "Interview Invitation", color: "#8b5cf6" },
  { value: "final_review", label: "Final Review", color: "#f59e0b" },
  { value: "offer_extended", label: "Offer Extended", color: "#06b6d4" },
  { value: "hired", label: "Hired", color: "#10b981" },
];

export const POSITION_LABELS = {
  media_specialist: "Media Specialist",
  sales_growth_advisor: "Sales Growth Advisor",
};

export const getStatusLabel = (value, statuses) => {
  const list = statuses || [...APPLICATION_STATUSES, ...SALES_STATUSES];
  return list.find((s) => s.value === value)?.label || value || "Application Received";
};

export const getStatusColor = (value, statuses) => {
  const list = statuses || [...APPLICATION_STATUSES, ...SALES_STATUSES];
  return list.find((s) => s.value === value)?.color || "#B8956A";
};