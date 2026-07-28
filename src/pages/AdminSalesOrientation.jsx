import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, Landmark, FileText, GraduationCap, FlaskConical } from "lucide-react";
import I9EmployerReviewModal from "@/components/orientation/I9EmployerReviewModal";

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
  const [tab, setTab] = useState("queue");
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [i9Modal, setI9Modal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [o, t, m] = await Promise.all([
        base44.entities.SalesOrientation.list("-created_date", 200).catch(() => []),
        base44.entities.OrientationDocumentTemplate.list("-published_at", 100).catch(() => []),
        base44.entities.TrainingModule.list("order", 100).catch(() => []),
      ]);
      setRows(o || []);
      setTemplates(t || []);
      setModules(m || []);
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

  // Document publish
  const [docForm, setDocForm] = useState({ document_id: "", title: "", version: "", change_summary: "", required: true });
  const publishDoc = async () => {
    if (!docForm.document_id || !docForm.title || !docForm.version) { setError("document_id, title and version are required"); return; }
    setBusy("publishDoc");
    try {
      const res = await base44.functions.invoke("publishOrientationDocument", docForm);
      if (res.data?.success) { setDocForm({ document_id: "", title: "", version: "", change_summary: "", required: true }); await load(); }
      else setError(res.data?.error || "Publish failed.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  // Training module save
  const [modForm, setModForm] = useState({ module_id: "", title: "", description: "", order: 0, passing_score: 70, quizJson: "[]" });
  const saveModule = async () => {
    let quiz;
    try { quiz = JSON.parse(modForm.quizJson || "[]"); } catch (e) { setError("Quiz JSON is invalid."); return; }
    if (!modForm.module_id || !modForm.title) { setError("module_id and title are required"); return; }
    setBusy("saveModule");
    try {
      const res = await base44.functions.invoke("saveTrainingModule", { ...modForm, quiz_questions: quiz });
      if (res.data?.success) { setModForm({ module_id: "", title: "", description: "", order: 0, passing_score: 70, quizJson: "[]" }); await load(); }
      else setError(res.data?.error || "Save failed.");
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  // Tests
  const [testResults, setTestResults] = useState(null);
  const runTests = async () => {
    setBusy("tests");
    try {
      const res = await base44.functions.invoke("runOrientationTests", {});
      setTestResults(res.data);
    } catch (e) { setError(e.message); } finally { setBusy(""); }
  };

  const readyCount = rows.filter((o) => o.status !== "completed" && flag(o).length === 1 && flag(o)[0] === "Ready for final approval").length;
  const blockedCount = rows.filter((o) => o.payroll_hold).length;

  const TabBtn = ({ id, icon: Icon, label }) => (
    <button onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${tab === id ? "bg-[#B8956A] text-white" : "text-[#1A1A1A]/60 hover:bg-[#FFFBF5]"}`}><Icon className="w-3.5 h-3.5" /> {label}</button>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Sales Orientation & Payroll Enrollment</h1>
          <p className="text-sm text-[#1A1A1A]/60">{rows.length} employees in orientation</p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-semibold">{readyCount} ready</span>
          <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full font-semibold">{blockedCount} on hold</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabBtn id="queue" icon={Landmark} label="Orientation Queue" />
        <TabBtn id="documents" icon={FileText} label="Documents" />
        <TabBtn id="training" icon={GraduationCap} label="Training" />
        <TabBtn id="tests" icon={FlaskConical} label="Test Harness" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <div className="flex items-center justify-center py-8 text-[#1A1A1A]/60"><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading…</div>}

      {/* QUEUE */}
      {tab === "queue" && !loading && (
        <div className="space-y-3">
          {rows.map((o) => {
            const flags = flag(o);
            const open = expanded === o.id;
            return (
              <Card key={o.id} className="border border-[#B8956A]/20 bg-white">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">{o.employee_name} <span className="text-xs font-normal text-[#1A1A1A]/50">· {o.job_title}</span></p>
                      <p className="text-xs text-[#1A1A1A]/50">{o.arriv_employee_id} · deadline {o.orientation_deadline || "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {o.status === "completed" ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : flags.length ? <AlertTriangle className="w-5 h-5 text-[#B8956A]" /> : <CheckCircle2 className="w-5 h-5 text-green-600" />}
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : o.id)}>{open ? "Hide" : "Manage"}</Button>
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
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[#1A1A1A]/60">
                        <span>I-9: <strong className="text-[#1A1A1A]">{(o.i9_status||"").replace(/_/g," ")}</strong></span>
                        <span>Background: <strong className="text-[#1A1A1A]">{o.background_check_status}</strong></span>
                        <span>Federal tax: <strong className="text-[#1A1A1A]">{o.federal_tax_status}</strong></span>
                        <span>State tax: <strong className="text-[#1A1A1A]">{o.state_tax_required ? o.state_tax_status : "n/a"}</strong></span>
                        <span>Stripe: <strong className="text-[#1A1A1A]">{(o.stripe_onboarding_status||"").replace(/_/g," ")}</strong></span>
                        <span>Payroll ready: <strong className="text-[#1A1A1A]">{o.payroll_ready ? "yes" : "no"}</strong></span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" onClick={() => setI9Modal(o)}><ShieldCheck className="w-3.5 h-3.5 mr-1" /> I-9 Employer Review</Button>
                        <Button size="sm" variant="outline" disabled={busy === `${o.id}:final_approve`} onClick={() => act(o.id, "final_approve")}>Final Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy === `${o.id}:final_reject`} onClick={() => act(o.id, "final_reject")}>Reject</Button>
                        {o.payroll_hold ? <Button size="sm" variant="outline" disabled={busy === `${o.id}:hold_release`} onClick={() => act(o.id, "hold_release")}>Release Hold</Button>
                          : <Button size="sm" variant="outline" disabled={busy === `${o.id}:hold_apply`} onClick={() => act(o.id, "hold_apply", { hold_reason: "Manual hold" })}>Apply Hold</Button>}
                        <Button size="sm" variant="outline" disabled={busy === `${o.id}:bg_clear`} onClick={() => act(o.id, "background_result", { background_result: "clear" })}>Mark BG Clear</Button>
                        <Button size="sm" variant="outline" disabled={busy === `${o.id}:bg_fail`} onClick={() => act(o.id, "background_result", { background_result: "failed" })}>Mark BG Failed</Button>
                        {o.sales_member_id && o.status === "not_started" && <Button size="sm" variant="outline" disabled={busy === `start:${o.sales_member_id}`} onClick={() => startOrientation(o.sales_member_id)}><Landmark className="w-3.5 h-3.5 mr-1" /> Start Orientation</Button>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DOCUMENTS */}
      {tab === "documents" && !loading && (
        <div className="space-y-4">
          <Card className="border border-[#B8956A]/20 bg-white">
            <CardContent className="pt-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> Publish Document Version</h2>
              <p className="text-xs text-[#1A1A1A]/60">Increasing the version of an existing document automatically creates a re-acknowledgment task for every active employee.</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Document ID</Label><Input value={docForm.document_id} onChange={(e) => setDocForm({ ...docForm, document_id: e.target.value })} placeholder="employment_agreement" /></div>
                <div><Label className="text-xs">Title</Label><Input value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} /></div>
                <div><Label className="text-xs">Version</Label><Input value={docForm.version} onChange={(e) => setDocForm({ ...docForm, version: e.target.value })} placeholder="1.1" /></div>
                <div><Label className="text-xs">Change summary</Label><Input value={docForm.change_summary} onChange={(e) => setDocForm({ ...docForm, change_summary: e.target.value })} /></div>
              </div>
              <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "publishDoc"} onClick={publishDoc}>{busy === "publishDoc" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Publish Version</Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-[#B8956A]/20 rounded-lg px-3 py-2 bg-white">
                <div><p className="text-sm font-medium text-[#1A1A1A]">{t.title}</p><p className="text-xs text-[#1A1A1A]/50">{t.document_id} · v{t.version}{t.change_summary ? ` · ${t.change_summary}` : ""}</p></div>
                <span className="text-xs text-[#1A1A1A]/50">{t.published_at ? new Date(t.published_at).toLocaleDateString() : ""}</span>
              </div>
            ))}
            {templates.length === 0 && <p className="text-xs text-[#1A1A1A]/50">No custom templates published yet — four default documents are active.</p>}
          </div>
        </div>
      )}

      {/* TRAINING */}
      {tab === "training" && !loading && (
        <div className="space-y-4">
          <Card className="border border-[#B8956A]/20 bg-white">
            <CardContent className="pt-4 space-y-3">
              <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2"><GraduationCap className="w-4 h-4 text-[#B8956A]" /> Training Module</h2>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Module ID</Label><Input value={modForm.module_id} onChange={(e) => setModForm({ ...modForm, module_id: e.target.value })} placeholder="sales_101" /></div>
                <div><Label className="text-xs">Title</Label><Input value={modForm.title} onChange={(e) => setModForm({ ...modForm, title: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-xs">Description</Label><Input value={modForm.description} onChange={(e) => setModForm({ ...modForm, description: e.target.value })} /></div>
                <div><Label className="text-xs">Order</Label><Input type="number" value={modForm.order} onChange={(e) => setModForm({ ...modForm, order: Number(e.target.value) })} /></div>
                <div><Label className="text-xs">Passing score %</Label><Input type="number" value={modForm.passing_score} onChange={(e) => setModForm({ ...modForm, passing_score: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label className="text-xs">Quiz questions (JSON array)</Label>
                <Textarea rows={5} value={modForm.quizJson} onChange={(e) => setModForm({ ...modForm, quizJson: e.target.value })} placeholder='[{"question":"...","choices":["a","b","c"],"correct_index":0,"explanation":"..."}]' />
              </div>
              <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "saveModule"} onClick={saveModule}>{busy === "saveModule" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save Module</Button>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {modules.map((m) => (
              <div key={m.id} className="border border-[#B8956A]/20 rounded-lg px-3 py-2 bg-white">
                <p className="text-sm font-medium text-[#1A1A1A]">{m.title}</p>
                <p className="text-xs text-[#1A1A1A]/50">{m.module_id} · v{m.version} · {(m.quiz_questions||[]).length} questions · pass {m.passing_score}%</p>
              </div>
            ))}
            {modules.length === 0 && <p className="text-xs text-[#1A1A1A]/50">No training modules yet. Add one above.</p>}
          </div>
        </div>
      )}

      {/* TESTS */}
      {tab === "tests" && (
        <Card className="border border-[#B8956A]/20 bg-white">
          <CardContent className="pt-4 space-y-3">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2"><FlaskConical className="w-4 h-4 text-[#B8956A]" /> Orientation Test Harness</h2>
            <p className="text-xs text-[#1A1A1A]/60">Runs assertions over the readiness engine, payload sanitization, and event mapping.</p>
            <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={busy === "tests"} onClick={runTests}>{busy === "tests" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Run Tests</Button>
            {testResults && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[#1A1A1A]">{testResults.passed}/{testResults.total} passed {testResults.failed > 0 && <span className="text-red-600">· {testResults.failed} failed</span>}</p>
                <div className="space-y-1">
                  {(testResults.results || []).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {r.pass ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                      <span className={r.pass ? "text-[#1A1A1A]" : "text-red-600"}>{r.name}{r.detail ? ` — ${r.detail}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {i9Modal && <I9EmployerReviewModal orientation={i9Modal} onClose={() => setI9Modal(null)} onDone={load} />}
    </div>
  );
}