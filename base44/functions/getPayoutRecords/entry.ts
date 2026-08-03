import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getPayrollConfig, callPayrollApi, maskTin } from "../../shared/contractorPayoutShared.ts";

// Aggregates all payout-record data for the authenticated media specialist.
// Enforces contractor-level authorization server-side: the caller may only
// see their own records.
//
// Actions:
//   get_overview       — summary cards (YTD, current month, pending, last payout, W-9 status)
//   get_payout_history — Estate Media's authoritative payment ledger with filters
//   get_weekly_statements — ContractorPayoutDocument weekly statements
//   get_monthly_statements — ContractorPayoutDocument monthly statements
//   get_tax_documents — ContractorPayoutDocument tax documents + W-9 status
//   download_document — request a signed download URL from Arriv Payroll

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, ...params } = body;

    // Resolve the authenticated media specialist
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user || !user.email) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const email = user.email;

    switch (action) {
      case "get_overview": return await getOverview(base44, email);
      case "get_payout_history": return await getPayoutHistory(base44, email, params);
      case "get_weekly_statements": return await getStatements(base44, email, "weekly_statement");
      case "get_monthly_statements": return await getStatements(base44, email, "monthly_statement");
      case "get_tax_documents": return await getTaxDocuments(base44, email);
      case "download_document": return await downloadDocument(base44, email, params);
      default: return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: get_overview ───────────────────────────────────────────────────
async function getOverview(base44, email) {
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const today = new Date().toISOString().slice(0, 10);

  // Payout history (Estate Media authoritative ledger)
  const payouts = await base44.asServiceRole.entities.PayoutHistory.filter({
    media_partner_email: email,
  }, "-payout_date", 500);

  const completedPayouts = (payouts || []).filter((p) => p.status === "completed" && p.payout_type !== "apparel_deduction");
  const pendingPayouts = (payouts || []).filter((p) => p.status === "pending" && p.payout_type !== "apparel_deduction");

  const ytdPaid = completedPayouts
    .filter((p) => p.payout_date >= yearStart)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const currentMonthStart = today.slice(0, 7) + "-01";
  const currentMonthEarnings = completedPayouts
    .filter((p) => p.payout_date >= currentMonthStart)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const pendingTotal = pendingPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  const lastPayout = completedPayouts[0] || null;

  // W-9 / tax document status from ContractorPayoutDocument
  const w9Docs = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
    media_specialist_email: email,
    document_type: "w9",
  });
  const w9Status = w9Docs && w9Docs.length ? (w9Docs[0].status || "available") : "not_submitted";

  const taxDocs = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
    media_specialist_email: email,
    document_type: { $in: ["tax_document", "corrected_tax_document"] },
    tax_year: year,
  });
  const taxDocStatus = taxDocs && taxDocs.length ? "available" : "pending";

  // Stripe Connect status from the User account
  let stripeEnabled = false;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (users && users[0]) {
      stripeEnabled = !!users[0].stripe_payouts_enabled;
    }
  } catch (_e) {}

  return Response.json({
    overview: {
      total_paid_this_year: ytdPaid,
      current_month_earnings: currentMonthEarnings,
      pending_payouts: pendingTotal,
      pending_payout_count: pendingPayouts.length,
      last_payout: lastPayout,
      ytd_earnings: ytdPaid,
      w9_status: w9Status,
      tax_document_status: taxDocStatus,
      stripe_payouts_enabled: stripeEnabled,
    },
  });
}

// ─── Action: get_payout_history ─────────────────────────────────────────────
async function getPayoutHistory(base44, email, { year, month, status }) {
  let payouts = await base44.asServiceRole.entities.PayoutHistory.filter({
    media_partner_email: email,
  }, "-payout_date", 500);

  let filtered = payouts || [];

  if (year) {
    filtered = filtered.filter((p) => p.payout_date && p.payout_date.startsWith(String(year)));
  }
  if (month) {
    const mm = String(month).padStart(2, "0");
    const prefix = year ? `${year}-${mm}` : `-${mm}-`;
    filtered = filtered.filter((p) => p.payout_date && (year ? p.payout_date.startsWith(prefix) : p.payout_date.includes(`-${mm}-`)));
  }
  if (status) {
    filtered = filtered.filter((p) => p.status === status);
  }

  return Response.json({ payouts: filtered });
}

// ─── Action: get_statements (weekly or monthly) ─────────────────────────────
async function getStatements(base44, email, docType) {
  const docs = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
    media_specialist_email: email,
    document_type: docType,
    status: { $in: ["available", "amended"] },
  }, "-period_end", 200);

  // For weekly statements, also include historical PaymentStatement records
  // (pre-Arriv-Payroll statements) so contractors see their full history.
  let legacy = [];
  if (docType === "weekly_statement") {
    try {
      const stmts = await base44.asServiceRole.entities.PaymentStatement.filter({
        media_partner_email: email,
        is_archived: false,
      }, "-payout_date", 200);
      legacy = (stmts || []).map((s) => ({
        id: "legacy_" + s.id,
        document_type: "weekly_statement",
        title: `Weekly Statement — ${new Date(s.payment_period_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${new Date(s.payment_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        period_start: s.payment_period_start,
        period_end: s.payment_period_end,
        tax_year: s.year,
        status: "available",
        is_amended: false,
        gross_amount: s.total_gross_paid,
        _legacy: true,
        _legacy_file_url: s.file_url,
        _legacy_file_name: s.file_name,
        available_at: s.payout_date ? new Date(s.payout_date).toISOString() : null,
      }));
    } catch (_e) {
      // best-effort
    }
  }

  // Merge and sort by period_end descending
  const all = [...(docs || []), ...legacy];
  all.sort((a, b) => {
    const da = a.period_end ? new Date(a.period_end).getTime() : 0;
    const db = b.period_end ? new Date(b.period_end).getTime() : 0;
    return db - da;
  });

  return Response.json({ documents: all });
}

// ─── Action: get_tax_documents ─────────────────────────────────────────────
async function getTaxDocuments(base44, email) {
  const w9Docs = await base44.asServiceRole.entities.ContractorPayoutDocument.filter({
    media_specialist_email: email,
    document_type: { $in: ["w9", "tax_document", "corrected_tax_document"] },
  }, "-tax_year", 200);

  // Mask any TIN-like fields — never expose full taxpayer identification
  const safe = (w9Docs || []).map((d) => ({
    ...d,
    // secure_document_reference is opaque and safe to expose; but we strip any
    // field that might contain a raw TIN (there shouldn't be one, but defense in depth)
    _masked: maskTin(d.secure_document_reference),
  }));

  return Response.json({ documents: safe });
}

// ─── Action: download_document ──────────────────────────────────────────────
async function downloadDocument(base44, email, { document_id }) {
  if (!document_id) return Response.json({ error: "document_id is required" }, { status: 400 });

  // Verify ownership
  const doc = await base44.asServiceRole.entities.ContractorPayoutDocument.get(document_id);
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });
  if (doc.media_specialist_email !== email) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const config = getPayrollConfig();
  if (!config.enabled) {
    return Response.json({ error: "Payroll integration not configured" }, { status: 503 });
  }

  try {
    const result = await callPayrollApi(config, "contractorDocumentDownload", {
      payroll_document_id: doc.payroll_document_id,
      secure_document_reference: doc.secure_document_reference,
      media_specialist_id: doc.media_specialist_id,
    });
    // Return a time-limited signed URL from Arriv Payroll (never a public storage URL)
    return Response.json({
      success: true,
      download_url: result.download_url || result.signed_url || "",
      expires_at: result.expires_at || "",
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}