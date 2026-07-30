// Sales performance metrics engine.
// Computes rep and tenant-wide performance from ActivityLog, Deal, Commission,
// Contact, and SmsMessage data. Shared by getSalesPerformance, getOwnerDashboard,
// getEmployeeProfile, and getSalesCoaching so every dashboard stays consistent.

const LIMIT = 1000;

export function periodBounds(period, ref = new Date()) {
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  switch (period) {
    case "daily": break;
    case "weekly": {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      break;
    }
    case "monthly": start.setDate(1); break;
    case "quarterly": start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); break;
    case "yearly": start.setMonth(0, 1); break;
    default: break;
  }
  return { start, end };
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

function isMeaningful(a) {
  if (a.missed) return false;
  if (a.activity_type === "call") return (a.duration_minutes || 0) > 0 || !!a.notes;
  if (a.activity_type === "meeting") return true;
  return false;
}

export function extractMarket(address) {
  if (!address) return "Unknown";
  const m = String(address).match(/\b([A-Z]{2})\s+\d{5}/);
  if (m) return stateToMarket(m[1]);
  const lower = String(address).toLowerCase();
  if (lower.includes("atlanta") || lower.includes("ga") || lower.includes("georgia")) return "Atlanta";
  if (lower.includes("maryland") || lower.includes(" md") || lower.includes("md ")) return "Maryland";
  if (lower.includes("texas") || lower.includes("tx")) return "Texas";
  if (lower.includes("florida") || lower.includes("fl")) return "Florida";
  return "Other";
}

function stateToMarket(state) {
  const map = { GA: "Atlanta", MD: "Maryland", TX: "Texas", FL: "Florida" };
  return map[state] || state;
}

export async function loadTenantData(base44, tenantId) {
  const [activities, deals, commissions, contacts, smsConvos] = await Promise.all([
    base44.asServiceRole.entities.ActivityLog.filter({ tenant_id: tenantId }, "-activity_date", LIMIT),
    base44.asServiceRole.entities.Deal.filter({ tenant_id: tenantId }, "-created_at", LIMIT),
    base44.asServiceRole.entities.Commission.filter({ tenant_id: tenantId }, "-earned_date", LIMIT),
    base44.asServiceRole.entities.Contact.filter({ tenant_id: tenantId }, "-created_date", LIMIT),
    base44.asServiceRole.entities.SmsConversation.filter({ tenant_id: tenantId }, "-last_message_at", LIMIT),
  ]);

  const convoToRep = {};
  for (const c of smsConvos) {
    if (c.sales_member_id) convoToRep[c.id] = c.sales_member_id;
  }

  let smsMessages = [];
  try {
    smsMessages = await base44.asServiceRole.entities.SmsMessage.filter(
      { tenant_id: tenantId, direction: "outbound" },
      "-created_date",
      LIMIT
    );
  } catch (_) {}

  return { activities, deals, commissions, contacts, smsMessages, convoToRep };
}

function repSlice(data, salesMemberId) {
  return {
    activities: data.activities.filter((a) => a.sales_member_id === salesMemberId),
    deals: data.deals.filter((d) => d.sales_member_id === salesMemberId),
    commissions: data.commissions.filter((c) => c.employee_id === salesMemberId),
    contacts: data.contacts.filter((c) => c.owner_id === salesMemberId),
    texts: data.smsMessages.filter((m) => data.convoToRep[m.conversation_id] === salesMemberId),
  };
}

function aggregate(slice, start, end) {
  let calls = 0, emails = 0, meetings = 0, conversations = 0, talkTime = 0, followups = 0;
  for (const a of slice.activities) {
    if (!inRange(a.activity_date, start, end)) continue;
    switch (a.activity_type) {
      case "call": calls++; talkTime += (a.duration_minutes || 0); if (isMeaningful(a)) conversations++; break;
      case "email": emails++; break;
      case "meeting": meetings++; if (isMeaningful(a)) conversations++; break;
      case "task": followups++; break;
      default: break;
    }
  }

  const texts = slice.texts.filter((m) => inRange(m.created_date, start, end)).length;

  let dealsWon = 0, dealsLost = 0, quotes = 0, revenue = 0;
  for (const d of slice.deals) {
    if (inRange(d.created_at, start, end)) quotes++;
    const dDate = d.closed_at || d.created_at;
    if (inRange(dDate, start, end)) {
      if (d.status === "won" || d.status === "paid") { dealsWon++; revenue += (d.amount_collected || d.contract_value || 0); }
      else if (d.status === "lost") dealsLost++;
    }
  }

  let commission = 0;
  for (const c of slice.commissions) {
    if (inRange(c.earned_date, start, end)) commission += (c.gross_amount || 0);
  }

  const newContacts = slice.contacts.filter((c) => inRange(c.created_date, start, end)).length;
  const totalDecisions = dealsWon + dealsLost;
  const closeRate = totalDecisions > 0 ? (dealsWon / totalDecisions) * 100 : 0;
  const avgDealSize = dealsWon > 0 ? revenue / dealsWon : 0;

  return {
    calls, emails, texts, conversations, appointments: meetings, meetings,
    talkTime, followups, newContacts, quotes, dealsWon, dealsLost,
    revenue: Math.round(revenue * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    closeRate: Math.round(closeRate * 10) / 10,
    avgDealSize: Math.round(avgDealSize * 100) / 100,
  };
}

export function computeRepMetrics(data, salesMemberId, start, end) {
  return aggregate(repSlice(data, salesMemberId), start, end);
}

export function computeTenantRollup(data, members, start, end) {
  const rollup = {};
  for (const m of members) {
    rollup[m.id] = aggregate(repSlice(data, m.id), start, end);
  }
  return rollup;
}

export function computePipeline(data, salesMemberId) {
  const slice = repSlice(data, salesMemberId);
  const leads = slice.contacts.length;
  const contactedEmails = new Set(slice.activities.filter((a) => a.contact_email).map((a) => a.contact_email));
  const conversations = new Set(
    slice.activities.filter((a) => isMeaningful(a) && a.contact_email).map((a) => a.contact_email)
  ).size;
  const appointments = slice.activities.filter((a) => a.activity_type === "meeting").length;
  const quotes = slice.deals.length;
  const clients = slice.deals.filter((d) => d.status === "won" || d.status === "paid").length;
  const revenue = slice.deals
    .filter((d) => d.status === "won" || d.status === "paid")
    .reduce((s, d) => s + (d.amount_collected || d.contract_value || 0), 0);
  return { leads, conversations, appointments, quotes, clients, revenue: Math.round(revenue * 100) / 100 };
}

export function computeLifetimeStats(data, salesMemberId) {
  const slice = repSlice(data, salesMemberId);
  const calls = slice.activities.filter((a) => a.activity_type === "call").length;
  const emails = slice.activities.filter((a) => a.activity_type === "email").length;
  const appointments = slice.activities.filter((a) => a.activity_type === "meeting").length;
  const texts = slice.texts.length;
  const wonDeals = slice.deals.filter((d) => d.status === "won" || d.status === "paid");
  const revenue = wonDeals.reduce((s, d) => s + (d.amount_collected || d.contract_value || 0), 0);
  const commission = slice.commissions.reduce((s, c) => s + (c.gross_amount || 0), 0);
  return {
    calls, emails, texts, appointments,
    clientsClosed: wonDeals.length,
    revenue: Math.round(revenue * 100) / 100,
    commission: Math.round(commission * 100) / 100,
  };
}

export function computeCallStreak(data, salesMemberId, dailyCallGoal) {
  const goal = dailyCallGoal || 1;
  const byDay = {};
  for (const a of data.activities.filter((x) => x.sales_member_id === salesMemberId && x.activity_type === "call")) {
    const day = String(a.activity_date || "").slice(0, 10);
    if (day) byDay[day] = (byDay[day] || 0) + 1;
  }
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const d = cursor.toISOString().slice(0, 10);
    if ((byDay[d] || 0) >= goal) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

export function computeRevenueByMarket(data) {
  const byMarket = {};
  for (const d of data.deals) {
    if (d.status !== "won" && d.status !== "paid") continue;
    const market = extractMarket(d.service_address || d.company);
    byMarket[market] = (byMarket[market] || 0) + (d.amount_collected || d.contract_value || 0);
  }
  return Object.entries(byMarket)
    .map(([market, revenue]) => ({ market, revenue: Math.round(revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue);
}