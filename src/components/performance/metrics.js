import { Phone, Mail, MessageSquare, MessagesSquare, Calendar, Handshake, DollarSign, Wallet, Users, CheckSquare, FileText, Target, Clock, TrendingUp, Award, Flame } from "lucide-react";

export const METRIC_LABELS = {
  calls: "Calls", emails: "Emails", texts: "Texts", conversations: "Conversations",
  appointments: "Appointments", deals: "Deals Closed", revenue: "Revenue",
  commission: "Commission", new_contacts: "New Contacts", followups: "Follow-ups",
  meetings: "Meetings", quotes: "Quotes Sent",
};

export const METRIC_ICONS = {
  calls: Phone, emails: Mail, texts: MessageSquare, conversations: MessagesSquare,
  appointments: Calendar, deals: Handshake, revenue: DollarSign, commission: Wallet,
  new_contacts: Users, followups: CheckSquare, meetings: Calendar, quotes: FileText,
};

export const KPI_ICONS = {
  calls: Phone, talkTime: Clock, emails: Mail, texts: MessageSquare,
  newContacts: Users, followups: CheckSquare, meetings: Calendar, quotes: FileText,
  dealsWon: Handshake, dealsLost: Target, revenue: DollarSign, commission: Wallet,
  closeRate: TrendingUp, avgDealSize: DollarSign, avgResponseTime: Clock,
};

export const KPI_LABELS = {
  calls: "Calls", talkTime: "Talk Time", emails: "Emails", texts: "Texts",
  newContacts: "New Contacts", followups: "Follow-ups", meetings: "Meetings",
  quotes: "Quotes Sent", dealsWon: "Deals Won", dealsLost: "Deals Lost",
  revenue: "Revenue", commission: "Commission", closeRate: "Close Rate",
  avgDealSize: "Avg Deal Size", avgResponseTime: "Avg Response Time",
};

export function formatMetric(metric, value) {
  const n = Number(value || 0);
  if (metric === "revenue" || metric === "commission" || metric === "avgDealSize") {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (metric === "closeRate") return `${n.toFixed(1)}%`;
  if (metric === "talkTime") return `${n}m`;
  if (metric === "avgResponseTime") return n ? `${n.toFixed(1)}h` : "—";
  return n.toLocaleString();
}

export function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#2563EB";
  if (score >= 40) return "#eab308";
  return "#dc2626";
}