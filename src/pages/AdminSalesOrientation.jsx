import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Landmark } from "lucide-react";

function flag(o) {
  const f = [];
  if (!o.payroll_profile_created) f.push("Payroll profile missing");
  if (o.federal_tax_status !== "complete") f.push("Federal tax incomplete");
  if (o.state_tax_required && o.state_tax_status !== "complete") f.push("State tax incomplete");
  if (!["payouts_enabled","complete"].includes(o.stripe_onboarding_status)) f.push("Stripe incomplete");
  if (!o.payouts_enabled) f.push("Payouts disabled");
  if (!["employer_review_complete","complete"].includes(o.i9_status)) f.push("I-9 employer review needed");
  if (!o.documents_complete) f.push("Missing documents");
  if (o.training_status !== "complete") f.push("Training incomplete");
  if (o.background_check_status !== "clear") f.push("Background check pending");
  if (o.payroll_hold) f.push("Payroll hold");
  if (!o.payroll_ready) f.push("Not payroll-ready");
  if (o.status !== "completed" && f.length === 0) f.push("Ready for final approval");
  return f;
}

export default function AdminSalesOrientation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const list = await base44.entities.SalesOrientation.list("-created_date", 200);
      setRows(list || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (orientation_id, action, extra = {}) => {
    setBusy(`${orientation_id}:${action}`);
    try {
      const res = await base44.functions.invoke("adminReviewOrientation", { orientation_id, action, ...extra });
      if (res.data?.success) await load();
      else setError(res.data?.error || "Action failed.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const startOrientation = async (memberId) => {
    setBusy(`start:${memberId}`);
    try {
      const res = await base44.functions.invoke("startSalesOrientation", { sales_member_id: memberId });
      if (res.data?.success) await load();
      else setError(res.data?.error || "Could not start orientation.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const readyCount = rows.filter((o) => o.status !== "completed" && flag(o).length === 1 && flag(o)[0] === "Ready for final approval").length;
  const blockedCount = rows.filter((o) => o.payroll_hold).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Sales Orientation & Payroll Enrollment</h1>
          <p className="text-sm text-[var(--text-secondary)]">{rows.length} employees in orientation</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-semibold">{readyCount} ready</span>
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full font-semibold">{blockedCount} on hold</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading…</div> : null}

      <div className="space-y-3">
        {rows.map((o) => {
          const flags = flag(o);
          const open = expanded === o.orientation_id;
          return (
            <Card key={o.id} className="border border-[#B8956A]/20 bg-white">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{o.employee_name} <span className="text-xs font-normal text-[var(--text-secondary)]">· {o.job_title}</span></p>
                    <p className="text-xs text-[var(--text-secondary)]">{o.arriv_employee_id} · deadline {o.orientation_deadline || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : flags.length ? <AlertTriangle className="w-5 h-5 text-[#B8956A]" /> : <CheckCircle2 className="w-5 h-5 text-green-600" />}
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : o.orientation_id)}>{open ? "Hide" : "Manage"}</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {flags.map((fl) => (
                    <span key={fl} className={`text-xs px-2 py-0.5 rounded-full ${fl === "Ready for final approval" ? "bg-green-50 text-green-700" : fl === "Payroll hold" ? "bg-red-50 text-red-700" : "bg-[#B8956A]/10 text-[#B8956A]"}`}>{fl}</span>
                  ))}
                  {o.status === "completed" && <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">Completed</span>}
                </div>

                {open && (
                  <div className="pt-2 border-t border-[#B8956A]/10 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                      <span>I-9: <strong className="text-[var(--text-primary)]">{o.i9_status.replace(/_/g, " ")}</strong></span>
                      <span>Background: <strong className="text-[var(--text-primary)]">{o.background_check_status}</strong></span>
                      <span>Federal tax: <strong className="text-[var(--text-primary)]">{o.federal_tax_status}</strong></span>
                      <span>State tax: <strong className="text-[var(--text-primary)]">{o.state_tax_required ? o.state_tax_status : "n/a"}</strong></span>
                      <span>Stripe: <strong className="text-[var(--text-primary)]">{o.stripe_onboarding_status.replace(/_/g, " ")}</strong></span>
                      <span>Payroll ready: <strong className="text-[var(--text-primary)]">{o.payroll_ready ? "yes" : "no"}</strong></span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:i9_complete`} onClick={() => act(o.orientation_id, "i9_complete")}>{busy === `${o.orientation_id}:i9_complete` ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1" />} I-9 Employer Verify</Button>
                      <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:final_approve`} onClick={() => act(o.orientation_id, "final_approve")}>Final Approve</Button>
                      <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:final_reject`} onClick={() => act(o.orientation_id, "final_reject")}>Reject</Button>
                      {o.payroll_hold ? <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:hold_release`} onClick={() => act(o.orientation_id, "hold_release")}>Release Hold</Button>
                        : <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:hold_apply`} onClick={() => act(o.orientation_id, "hold_apply", { hold_reason: "Manual hold" })}>Apply Hold</Button>}
                      <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:bg_clear`} onClick={() => act(o.orientation_id, "background_result", { background_result: "clear" })}>Mark BG Clear</Button>
                      <Button size="sm" variant="outline" disabled={busy === `${o.orientation_id}:bg_fail`} onClick={() => act(o.orientation_id, "background_result", { background_result: "failed" })}>Mark BG Failed</Button>
                    </div>
                    {o.sales_member_id && o.status === "not_started" && (
                      <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === `start:${o.sales_member_id}`} onClick={() => startOrientation(o.sales_member_id)}><Landmark className="w-3.5 h-3.5 mr-1" /> Start Orientation</Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}