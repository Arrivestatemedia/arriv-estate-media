import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Circle, ArrowUpRight, ShieldCheck, FileText, CreditCard, GraduationCap, UserCheck, Lock } from "lucide-react";
import OrientationReadinessCard from "@/components/orientation/OrientationReadinessCard";

function getSalesId() {
  return localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
}

function StatusPill({ ok, label }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> {label || "Complete"}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B8956A]"><Circle className="w-3.5 h-3.5" /> Action needed</span>
  );
}

export default function SalesOrientationDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const salesId = getSalesId();

  const load = useCallback(async () => {
    if (!salesId) { setError("Please sign in to your sales account."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const res = await base44.functions.invoke("getSalesOrientation", { sales_member_id: salesId });
      if (res.data?.success) setData(res.data);
      else setError(res.data?.error || "Could not load orientation.");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [salesId]);

  useEffect(() => { load(); }, [load]);

  const run = async (name, payload, label) => {
    setBusy(label);
    try {
      const res = await base44.functions.invoke(name, { sales_member_id: salesId, ...payload });
      if (res.data?.enrollment_url) { window.location.href = res.data.enrollment_url; return; }
      if (res.data?.invitation_url) { window.open(res.data.invitation_url, "_blank"); }
      if (res.data?.success !== false) await load();
      else setError(res.data?.error || "Action failed.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading your orientation…</div>;
  if (error && !data) return <div className="max-w-2xl mx-auto py-12 px-4"><p className="text-sm text-red-600">{error}</p></div>;
  if (!data) return null;

  const { orientation: o, readiness, documents, training, employee } = data;
  const welcomeDone = !!o.welcome_acknowledged_at;
  const personalDone = o.personal_info_status === "submitted" || o.personal_info_status === "reviewed";
  const bgDone = o.background_check_status === "clear";
  const bgPending = o.background_check_status === "pending";
  const i9EmpDone = ["employee_section_complete","employer_review_scheduled","employer_review_complete","complete"].includes(o.i9_status);
  const i9FullDone = ["employer_review_complete","complete"].includes(o.i9_status);
  const taxDone = o.federal_tax_status === "complete" && (!o.state_tax_required || o.state_tax_status === "complete");
  const ddDone = !!o.payouts_enabled;
  const docsDone = !!o.documents_complete;
  const trainDone = o.training_status === "complete";
  const reviewDone = o.final_review_status === "approved";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">New Employee Orientation</h1>
          <p className="text-sm text-[var(--text-secondary)]">{employee?.full_name} · {o.job_title} · {o.department}</p>
          <p className="text-xs text-[var(--text-secondary)]">Employee ID: {o.arriv_employee_id}</p>
        </div>
        {o.status === "completed" && <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">Completed</span>}
      </div>

      <OrientationReadinessCard readiness={readiness} orientation={o} />

      {/* SECTION 1 — WELCOME */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#B8956A]" /> 1. Welcome to Arriv</span><StatusPill ok={welcomeDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Welcome to Arriv! Our mission is to deliver world-class real-estate media. Review your role details below and acknowledge to continue.</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span>Title: <strong className="text-[var(--text-primary)]">{o.job_title}</strong></span>
            <span>Department: <strong className="text-[var(--text-primary)]">{o.department}</strong></span>
            <span>Manager: <strong className="text-[var(--text-primary)]">{o.manager || "—"}</strong></span>
            <span>Start date: <strong className="text-[var(--text-primary)]">{o.anticipated_start_date || "—"}</strong></span>
          </div>
          {!welcomeDone && <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "welcome"} onClick={() => run("completeOrientationSection", { section: "welcome" }, "welcome")}>{busy === "welcome" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Acknowledge & Continue</Button>}
        </CardContent>
      </Card>

      {/* SECTION 2 — PERSONAL & EMPLOYMENT INFO */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 2. Personal & Employment Information</span><StatusPill ok={personalDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Review your legal name, contact, address, emergency contact and work details. When correct, approve to sync your payroll profile to Arriv Payroll securely.</p>
          {!personalDone && <Button size="sm" variant="outline" disabled={busy === "personal"} onClick={() => run("completeOrientationSection", { section: "personal_info_submit" }, "personal")}>{busy === "personal" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Approve & Sync to Payroll</Button>}
          {personalDone && <p className="text-xs text-green-600">Profile submitted and synced to Arriv Payroll.</p>}
        </CardContent>
      </Card>

      {/* SECTION 3 — BACKGROUND CHECK */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#B8956A]" /> 3. Background Check</span><StatusPill ok={bgDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>A background check is required before your start date, using our screening partner (Checkr) — the same process as our media specialists.</p>
          {bgDone ? <p className="text-xs text-green-600">Background check cleared.</p>
            : <Button size="sm" variant="outline" disabled={busy === "bg"} onClick={() => run("initiateSalesBackgroundCheck", {}, "bg")}>{busy === "bg" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}{bgPending ? "Open Background Check" : "Start Background Check"}</Button>}
          {o.background_check_status === "failed" && <p className="text-xs text-red-600">Background check requires review. Contact HR.</p>}
        </CardContent>
      </Card>

      {/* SECTION 4 — I-9 EMPLOYMENT ELIGIBILITY */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-[#B8956A]" /> 4. Employment Eligibility (Form I-9)</span><StatusPill ok={i9FullDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>You complete the <strong>employee portion</strong> and present acceptable identity/work-authorization documents. Only authorized Arriv personnel perform the <strong>employer verification</strong> — the I-9 is not complete until that occurs.</p>
          <p className="text-xs">Status: {o.i9_status.replace(/_/g, " ")}</p>
          {!i9EmpDone && <Button size="sm" variant="outline" disabled={busy === "i9"} onClick={() => run("completeOrientationSection", { section: "i9_employee_complete" }, "i9")}>{busy === "i9" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Mark Employee Section Complete</Button>}
          {i9EmpDone && !i9FullDone && <p className="text-xs text-[#B8956A]">Awaiting Arriv employer verification.</p>}
          {i9FullDone && <p className="text-xs text-green-600">I-9 employer verification complete.</p>}
        </CardContent>
      </Card>

      {/* SECTION 5 — PAYROLL & TAX ENROLLMENT */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 5. Complete Payroll & Tax Setup</span><StatusPill ok={taxDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Tax forms (federal W-4 and state, including Georgia G-4) and your SSN are collected securely inside <strong>Arriv Payroll</strong> — never in Arriv One. You'll be redirected there and returned when finished.</p>
          <p className="text-xs">Federal: {o.federal_tax_status} · State: {o.state_tax_required ? o.state_tax_status : "not required"}</p>
          <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "tax"} onClick={() => run("createPayrollEnrollmentSession", { return_url: window.location.href }, "tax")}>{busy === "tax" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Open Payroll & Tax Setup <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
        </CardContent>
      </Card>

      {/* SECTION 6 — STRIPE DIRECT DEPOSIT */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#B8956A]" /> 6. Set Up Direct Deposit</span><StatusPill ok={ddDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Direct deposit is set up through Stripe Connect, requested via Arriv Payroll. Arriv One never sees your bank-account or routing numbers.</p>
          <p className="text-xs">Status: {o.stripe_onboarding_status.replace(/_/g, " ")}</p>
          <Button size="sm" variant="outline" disabled={busy === "dd"} onClick={() => run("createDirectDepositSession", { return_url: window.location.href }, "dd")}>{busy === "dd" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Set Up Direct Deposit <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
        </CardContent>
      </Card>

      {/* SECTION 7 — EMPLOYMENT DOCUMENTS */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 7. Employment Documents</span><StatusPill ok={docsDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-[var(--text-secondary)]">Acknowledge each document. Signed versions are permanent; updated versions create a new task.</p>
          <div className="space-y-1">
            {(documents || []).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 py-1 border-b border-[#B8956A]/10 last:border-0">
                <span className="text-xs text-[var(--text-primary)]">{d.title} <span className="text-[var(--text-secondary)]">({d.version})</span></span>
                {d.signed ? <StatusPill ok label="Signed" /> : (
                  <Button size="sm" variant="outline" disabled={busy === `doc-${d.id}`} onClick={() => run("recordOrientationDocument", { document_id: d.id, document_version: d.version, signature_method: "clickwrap" }, `doc-${d.id}`)}>{busy === `doc-${d.id}` ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Acknowledge</Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 8 — TRAINING */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-[#B8956A]" /> 8. Training</span><StatusPill ok={trainDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Complete the required orientation training modules.</p>
          <div className="space-y-1 text-xs">
            {(training || []).map((t) => (
              <div key={t.id} className="flex items-center gap-2"><Circle className={`w-3 h-3 ${t.complete ? "text-green-500" : "text-[#B8956A]/50"}`} /> {t.title}</div>
            ))}
          </div>
          {!trainDone && <Button size="sm" variant="outline" disabled={busy === "train"} onClick={() => run("completeOrientationSection", { section: "training_complete" }, "train")}>{busy === "train" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Mark Training Complete</Button>}
        </CardContent>
      </Card>

      {/* SECTION 9 — FINAL REVIEW */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[var(--text-primary)]"><span className="flex items-center gap-2"><Lock className="w-4 h-4 text-[#B8956A]" /> 9. Final Orientation Review</span><StatusPill ok={o.status === "completed"} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>Orientation completes only after every requirement above is done <strong>and</strong> Arriv Payroll confirms <strong>payroll_ready</strong>. Your owner/HR performs the final review.</p>
          <p className="text-xs">Final review: {o.final_review_status} · Payroll ready: {o.payroll_ready ? "yes" : "no"}{o.payroll_hold ? " · HOLD active" : ""}</p>
          <p className="text-xs text-[var(--text-secondary)] pt-1">Need help? Contact your Arriv manager or HR — never share tax, SSN or banking details by email or text.</p>
        </CardContent>
      </Card>
    </div>
  );
}