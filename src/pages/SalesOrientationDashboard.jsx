import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Circle, ArrowUpRight, ShieldCheck, FileText, CreditCard, GraduationCap, UserCheck, Lock } from "lucide-react";
import OrientationReadinessCard from "@/components/orientation/OrientationReadinessCard";
import OrientationTrainingQuiz from "@/components/orientation/OrientationTrainingQuiz";

function getSalesId() {
  return localStorage.getItem("sales_member_id") || sessionStorage.getItem("sales_member_id");
}
function StatusPill({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> {label || "Complete"}</span>
    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#B8956A]"><Circle className="w-3.5 h-3.5" /> Action needed</span>;
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

  if (loading) return <div className="flex items-center justify-center py-16 text-[#1A1A1A]/60"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading your orientation…</div>;
  if (error && !data) return <div className="max-w-2xl mx-auto py-12 px-4"><p className="text-sm text-red-600">{error}</p></div>;
  if (!data) return null;

  const { orientation: o, readiness, documents, training, employee } = data;
  const welcomeDone = !!o.welcome_acknowledged_at;
  const personalDone = o.personal_info_status === "submitted";
  const bgDone = o.background_check_status === "clear";
  const bgPending = o.background_check_status === "pending";
  const i9EmpDone = ["employee_section_complete","employer_review_scheduled","employer_review_complete","complete"].includes(o.i9_status);
  const i9FullDone = ["employer_review_complete","complete"].includes(o.i9_status);
  const taxDone = o.federal_tax_status === "complete" && (!o.state_tax_required || o.state_tax_status === "complete");
  const ddDone = !!o.payouts_enabled;
  const docsDone = !!o.documents_complete;
  const trainDone = o.training_status === "complete";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">New Employee Orientation</h1>
          <p className="text-sm text-[#1A1A1A]/60">{employee?.full_name} · {o.job_title} · {o.department}</p>
          <p className="text-xs text-[#1A1A1A]/60">Employee ID: {o.arriv_employee_id}</p>
        </div>
        {o.status === "completed" && <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">Completed</span>}
      </div>

      <OrientationReadinessCard readiness={readiness} orientation={o} />

      {/* 1. Welcome */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#B8956A]" /> 1. Welcome to Arriv</span><StatusPill ok={welcomeDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Welcome to Arriv! Our mission is world-class real-estate media. Review your role and acknowledge to continue.</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span>Title: <strong className="text-[#1A1A1A]">{o.job_title}</strong></span>
            <span>Department: <strong className="text-[#1A1A1A]">{o.department}</strong></span>
            <span>Manager: <strong className="text-[#1A1A1A]">{o.manager || "—"}</strong></span>
            <span>Start date: <strong className="text-[#1A1A1A]">{o.anticipated_start_date || "—"}</strong></span>
          </div>
          {!welcomeDone && <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "welcome"} onClick={() => run("completeOrientationSection", { section: "welcome" }, "welcome")}>{busy === "welcome" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Acknowledge & Continue</Button>}
        </CardContent>
      </Card>

      {/* 2. Personal info */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 2. Personal & Employment Information</span><StatusPill ok={personalDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Review your legal name, contact, address and work details. When correct, approve to sync your payroll profile to Arriv Payroll securely.</p>
          {!personalDone && <Button size="sm" variant="outline" disabled={busy === "personal"} onClick={() => run("completeOrientationSection", { section: "personal_info_submit" }, "personal")}>{busy === "personal" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Approve & Sync to Payroll</Button>}
          {personalDone && <p className="text-xs text-green-600">Profile submitted and synced to Arriv Payroll.</p>}
        </CardContent>
      </Card>

      {/* 3. Background check */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#B8956A]" /> 3. Background Check</span><StatusPill ok={bgDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>A background check is required before your start date, via our screening partner (Checkr).</p>
          {bgDone ? <p className="text-xs text-green-600">Background check cleared.</p>
            : <Button size="sm" variant="outline" disabled={busy === "bg"} onClick={() => run("initiateSalesBackgroundCheck", {}, "bg")}>{busy === "bg" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}{bgPending ? "Open Background Check" : "Start Background Check"}</Button>}
          {o.background_check_status === "failed" && <p className="text-xs text-red-600">Background check requires review. Contact HR.</p>}
        </CardContent>
      </Card>

      {/* 4. I-9 employee section */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-[#B8956A]" /> 4. Employment Eligibility (Form I-9)</span><StatusPill ok={i9FullDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Complete the <strong>employee portion</strong> and present acceptable identity/work-authorization documents. Only authorized Arriv personnel perform the <strong>employer verification</strong>.</p>
          <p className="text-xs">Status: {(o.i9_status || "").replace(/_/g, " ")}</p>
          {!i9EmpDone && <Button size="sm" variant="outline" disabled={busy === "i9"} onClick={() => run("completeOrientationSection", { section: "i9_employee_complete" }, "i9")}>{busy === "i9" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Mark Employee Section Complete</Button>}
          {i9EmpDone && !i9FullDone && <p className="text-xs text-[#B8956A]">Awaiting Arriv employer verification.</p>}
          {i9FullDone && <p className="text-xs text-green-600">I-9 employer verification complete.</p>}
        </CardContent>
      </Card>

      {/* 5. Payroll & tax */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 5. Complete Payroll & Tax Setup</span><StatusPill ok={taxDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Tax forms (federal W-4 and state, including Georgia G-4) and your SSN are collected securely inside <strong>Arriv Payroll</strong> — never in Arriv One.</p>
          <p className="text-xs">Federal: {o.federal_tax_status} · State: {o.state_tax_required ? o.state_tax_status : "not required"}</p>
          <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "tax"} onClick={() => run("createPayrollEnrollmentSession", { return_url: window.location.href }, "tax")}>{busy === "tax" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Open Payroll & Tax Setup <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
        </CardContent>
      </Card>

      {/* 6. Direct deposit */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-[#B8956A]" /> 6. Set Up Direct Deposit</span><StatusPill ok={ddDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Direct deposit is set up through Stripe Connect, requested via Arriv Payroll. Arriv One never sees your bank-account or routing numbers.</p>
          <p className="text-xs">Status: {(o.stripe_onboarding_status || "").replace(/_/g, " ")}</p>
          <Button size="sm" variant="outline" disabled={busy === "dd"} onClick={() => run("createDirectDepositSession", { return_url: window.location.href }, "dd")}>{busy === "dd" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Set Up Direct Deposit <ArrowUpRight className="w-4 h-4 ml-1" /></Button>
        </CardContent>
      </Card>

      {/* 7. Documents */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> 7. Employment Documents</span><StatusPill ok={docsDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-[#1A1A1A]/60">Acknowledge each document. When a document is updated to a new version, you'll be asked to re-acknowledge.</p>
          <div className="space-y-1">
            {(documents || []).map((d) => (
              <div key={`${d.id}-${d.version}`} className="flex items-center justify-between gap-2 py-1 border-b border-[#B8956A]/10 last:border-0">
                <span className="text-xs text-[#1A1A1A]">{d.title} <span className="text-[#1A1A1A]/50">(v{d.version}){d.required ? " · required" : ""}</span></span>
                {d.signed ? <StatusPill ok label="Signed" /> : (
                  <Button size="sm" variant="outline" disabled={busy === `doc-${d.id}`} onClick={() => run("recordOrientationDocument", { document_id: d.id, document_version: d.version, signature_method: "clickwrap" }, `doc-${d.id}`)}>{busy === `doc-${d.id}` ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null} Acknowledge</Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 8. Training */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-[#B8956A]" /> 8. Training</span><StatusPill ok={trainDone} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Complete each training module quiz. You must score at least the passing threshold to mark it complete.</p>
          {(training || []).length === 0 && <p className="text-xs">No training modules assigned yet.</p>}
          <div className="space-y-2">
            {(training || []).map((m) => (
              <OrientationTrainingQuiz key={m.id} module={m} salesMemberId={salesId} onDone={load} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 9. Final review */}
      <Card className="border-2 border-[#B8956A]/20 bg-white">
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center justify-between text-[#1A1A1A]"><span className="flex items-center gap-2"><Lock className="w-4 h-4 text-[#B8956A]" /> 9. Final Orientation Review</span><StatusPill ok={o.status === "completed"} /></CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-[#1A1A1A]/60">
          <p>Orientation completes only after every requirement above is done <strong>and</strong> Arriv Payroll confirms <strong>payroll_ready</strong>. Your owner/HR performs the final review.</p>
          <p className="text-xs">Final review: {o.final_review_status} · Payroll ready: {o.payroll_ready ? "yes" : "no"}{o.payroll_hold ? " · HOLD active" : ""}</p>
          <p className="text-xs pt-1">Need help? Contact your Arriv manager or HR — never share tax, SSN or banking details by email or text.</p>
        </CardContent>
      </Card>
    </div>
  );
}