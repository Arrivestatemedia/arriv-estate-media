export const APPLICATION_STATUSES = [
  { value: "received", label: "Application Received", color: "#B8956A" },
  { value: "reviewing", label: "Under Review", color: "#3b82f6" },
  { value: "accepted", label: "Accepted to Platform", color: "#10b981" },
  { value: "accepted_waitlist", label: "Accepted - Waitlist", color: "#f59e0b" },
  { value: "denied", label: "Access Denied", color: "#ef4444" },
];

export const getStatusLabel = (value) =>
  APPLICATION_STATUSES.find((s) => s.value === value)?.label || value || "Application Received";

export const getStatusColor = (value) =>
  APPLICATION_STATUSES.find((s) => s.value === value)?.color || "#B8956A";