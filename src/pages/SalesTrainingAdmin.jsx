import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Award, Phone, PhoneOff, AlertTriangle, CheckCircle2, XCircle, Shield, RefreshCw, Users, LayoutDashboard, BookOpen, ClipboardList } from "lucide-react";
import { TRAINING_STATUS, CALLING_AUTH, ROLEPLAY_RUBRIC, PRACTICUM_RUBRIC, CRITICAL_FAILURES, CERTIFICATION_REQUIREMENTS } from "@/lib/salesTrainingData";
import TrainingModuleManager from "@/components/admin/TrainingModuleManager";

const getAdminInfo = () => {
  const name = localStorage.getItem('user_name') || sessionStorage.getItem('user_name') || localStorage.getItem('sales_member_name') || '';
  const id = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id') || '';
  return { name, id };
};

const STATUS_COLORS = {
  NOT_STARTED: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  REMEDIATION_REQUIRED: "bg-orange-100 text-orange-700",
  TRAINING_COMPLETE: "bg-teal-100 text-teal-700",
  AWAITING_CERTIFICATION: "bg-purple-100 text-purple-700",
  SALES_CERTIFIED: "bg-[#B8956A] text-[#1A1A1A]",
  CERTIFICATION_SUSPENDED: "bg-red-100 text-red-700",
  NOT_CERTIFIED: "bg-slate-300 text-slate-700",
};

export default function SalesTrainingAdmin() {
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState(null);
  const [view, setView] = useState('overview');
  const [evalMode, setEvalMode] = useState(null); // 'roleplay' | 'practicum'
  const [activeTab, setActiveTab] = useState('dashboard');

  const loadCertifications = useCallback(async () => {
    try {
      const certs = await base44.entities.SalesCertification.list('-updated_date', 100);
      setCertifications(certs || []);
    } catch (err) {
      console.error("Failed to load certifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCertifications(); }, [loadCertifications]);

  const admin = getAdminInfo();

  const handleCertify = async (cert) => {
    if (!confirm(`Certify ${cert.sales_member_name}? This will grant INDEPENDENT_CALLING_AUTHORIZED.`)) return;
    try {
      const now = new Date().toISOString();
      await base44.entities.SalesCertification.update(cert.id, {
        training_status: TRAINING_STATUS.SALES_CERTIFIED,
        calling_authorization: CALLING_AUTH.INDEPENDENT_CALLING_AUTHORIZED,
        certified_at: now,
        certified_by: admin.name,
      });
      await base44.entities.AuditEvent.create({
        event_type: "SALES_CERTIFIED",
        sales_member_id: cert.sales_member_id,
        sales_member_name: cert.sales_member_name,
        actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
        entity_type: "SalesCertification", entity_id: cert.id,
        timestamp: now,
      });
      await loadCertifications();
    } catch (err) { console.error("Certification failed:", err); }
  };

  const handleSuspend = async (cert) => {
    const reason = prompt(`Reason for suspending ${cert.sales_member_name}'s certification?`);
    if (!reason) return;
    try {
      const now = new Date().toISOString();
      await base44.entities.SalesCertification.update(cert.id, {
        training_status: TRAINING_STATUS.CERTIFICATION_SUSPENDED,
        calling_authorization: CALLING_AUTH.CALLING_LOCKED,
        suspended_at: now,
        suspended_reason: reason,
      });
      await base44.entities.AuditEvent.create({
        event_type: "CERTIFICATION_SUSPENDED",
        sales_member_id: cert.sales_member_id,
        sales_member_name: cert.sales_member_name,
        actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
        entity_type: "SalesCertification", entity_id: cert.id,
        details: { reason }, timestamp: now,
      });
      await loadCertifications();
    } catch (err) { console.error("Suspension failed:", err); }
  };

  const handleRestore = async (cert) => {
    if (!confirm(`Restore ${cert.sales_member_name}'s certification?`)) return;
    try {
      const now = new Date().toISOString();
      await base44.entities.SalesCertification.update(cert.id, {
        training_status: TRAINING_STATUS.SALES_CERTIFIED,
        calling_authorization: CALLING_AUTH.INDEPENDENT_CALLING_AUTHORIZED,
        restored_at: now,
      });
      await base44.entities.AuditEvent.create({
        event_type: "CERTIFICATION_RESTORED",
        sales_member_id: cert.sales_member_id,
        sales_member_name: cert.sales_member_name,
        actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
        entity_type: "SalesCertification", entity_id: cert.id,
        timestamp: now,
      });
      await loadCertifications();
    } catch (err) { console.error("Restore failed:", err); }
  };

  const handleSetCallingAuth = async (cert, authLevel) => {
    try {
      const now = new Date().toISOString();
      await base44.entities.SalesCertification.update(cert.id, { calling_authorization: authLevel });
      const eventType = authLevel === CALLING_AUTH.SUPERVISED_CALLING_ONLY ? "CALLING_AUTHORIZED_SUPERVISED" :
                        authLevel === CALLING_AUTH.TRAINING_INDEPENDENT_CALLING_AUTHORIZED ? "CALLING_AUTHORIZED_TRAINING_INDEPENDENT" : null;
      if (eventType) {
        await base44.entities.AuditEvent.create({
          event_type: eventType,
          sales_member_id: cert.sales_member_id,
          sales_member_name: cert.sales_member_name,
          actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
          entity_type: "SalesCertification", entity_id: cert.id,
          timestamp: now,
        });
      }
      await loadCertifications();
    } catch (err) { console.error("Auth update failed:", err); }
  };

  // ── Dashboard stats ──
  const stats = certifications.reduce((acc, c) => {
    acc.total++;
    if (c.training_status === TRAINING_STATUS.SALES_CERTIFIED) acc.certified++;
    if (c.training_status === TRAINING_STATUS.IN_PROGRESS) acc.inProgress++;
    if (c.training_status === TRAINING_STATUS.REMEDIATION_REQUIRED) acc.remediation++;
    if (c.training_status === TRAINING_STATUS.AWAITING_CERTIFICATION) acc.awaiting++;
    if (c.calling_authorization === CALLING_AUTH.CALLING_LOCKED) acc.callingLocked++;
    if (c.calling_authorization === CALLING_AUTH.INDEPENDENT_CALLING_AUTHORIZED) acc.callingAuthorized++;
    if (c.roleplay_passed) acc.roleplayPassed++;
    if (c.practicum_passed) acc.practicumPassed++;
    return acc;
  }, { total: 0, certified: 0, inProgress: 0, remediation: 0, awaiting: 0, callingLocked: 0, callingAuthorized: 0, roleplayPassed: 0, practicumPassed: 0 });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Training Admin</h1>
            <p className="text-slate-600">Manage programs, modules, certifications, and calling authorization</p>
          </div>
          <Button variant="outline" onClick={loadCertifications} className="border-[#B8956A]/30">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-2"><LayoutDashboard className="w-4 h-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="modules" className="gap-2"><BookOpen className="w-4 h-4" /> Modules</TabsTrigger>
            <TabsTrigger value="roster" className="gap-2"><ClipboardList className="w-4 h-4" /> Roster</TabsTrigger>
          </TabsList>

          {/* ── Dashboard Tab ── */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatCard label="Total Reps" value={stats.total} icon={Users} />
              <StatCard label="Certified" value={stats.certified} icon={Award} color="#B8956A" />
              <StatCard label="In Progress" value={stats.inProgress} icon={RefreshCw} />
              <StatCard label="Remediation" value={stats.remediation} icon={AlertTriangle} color="#f59e0b" />
              <StatCard label="Awaiting Cert" value={stats.awaiting} icon={Shield} />
              <StatCard label="Calling Locked" value={stats.callingLocked} icon={PhoneOff} color="#ef4444" />
              <StatCard label="Calling Authorized" value={stats.callingAuthorized} icon={Phone} color="#B8956A" />
              <StatCard label="Roleplay Passed" value={stats.roleplayPassed} icon={CheckCircle2} />
            </div>

            <Card className="p-5 bg-white border-[#B8956A]/15">
              <h3 className="font-semibold text-[#1A1A1A] mb-3">Certification Requirements</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <ReqRow label="Module quiz min score" value={`${CERTIFICATION_REQUIREMENTS.module_quiz_min_score}%`} />
                <ReqRow label="Critical questions" value={`${CERTIFICATION_REQUIREMENTS.critical_questions_required}% correct`} />
                <ReqRow label="Final exam min score" value={`${CERTIFICATION_REQUIREMENTS.final_exam_min_score}%`} />
                <ReqRow label="Role-play min score" value={`${CERTIFICATION_REQUIREMENTS.roleplay_min_score}/100`} />
                <ReqRow label="Practicum min score" value={`${CERTIFICATION_REQUIREMENTS.practicum_min_score}/100`} />
                <ReqRow label="Video watch requirement" value={`${CERTIFICATION_REQUIREMENTS.min_watch_percentage}%`} />
              </div>
              <p className="text-xs mt-3" style={{ color: 'rgba(26,26,26,0.5)' }}>
                These requirements are configured in the training system. Critical failures override passing scores and require remediation.
              </p>
            </Card>
          </TabsContent>

          {/* ── Modules Tab ── */}
          <TabsContent value="modules">
            <TrainingModuleManager />
          </TabsContent>

          {/* ── Roster Tab ── */}
          <TabsContent value="roster">
            {view === 'overview' && (
              <div className="space-y-3">
                {certifications.length === 0 ? (
                  <Card className="p-8 text-center bg-white">
                      <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">No training records yet. Reps will appear here when they start training.</p>
                  </Card>
                ) : certifications.map((cert) => (
                  <Card key={cert.id} className="p-4 bg-white border-[#B8956A]/15 hover:border-[#B8956A]/40 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#B8956A]/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-[#B8956A]">{(cert.sales_member_name || "?").charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-[#1A1A1A]">{cert.sales_member_name || "Unknown"}</p>
                          <p className="text-sm text-slate-500">{cert.sales_member_email}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={STATUS_COLORS[cert.training_status] || STATUS_COLORS.NOT_STARTED}>
                              {cert.training_status?.replace(/_/g, ' ') || 'NOT STARTED'}
                            </Badge>
                            {cert.calling_authorization === CALLING_AUTH.CALLING_LOCKED && <PhoneOff className="w-4 h-4 text-red-500" />}
                            {cert.calling_authorization === CALLING_AUTH.SUPERVISED_CALLING_ONLY && <Phone className="w-4 h-4 text-orange-500" />}
                            {cert.calling_authorization === CALLING_AUTH.TRAINING_INDEPENDENT_CALLING_AUTHORIZED && <Phone className="w-4 h-4 text-blue-500" />}
                            {cert.calling_authorization === CALLING_AUTH.INDEPENDENT_CALLING_AUTHORIZED && <Phone className="w-4 h-4 text-green-500" />}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xl font-bold text-[#1A1A1A]">{cert.modules_passed_count || 0}/13</p>
                          <p className="text-xs text-slate-400">Modules</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-[#1A1A1A]">{cert.quiz_average_score ? Math.round(cert.quiz_average_score) : 0}%</p>
                          <p className="text-xs text-slate-400">Quiz Avg</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-[#1A1A1A]">{cert.roleplay_score || "—"}</p>
                          <p className="text-xs text-slate-400">Roleplay</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-[#1A1A1A]">{cert.practicum_score || "—"}</p>
                          <p className="text-xs text-slate-400">Practicum</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-[#B8956A]/30" onClick={() => { setSelectedCert(cert); setView('detail'); }}>
                          Manage
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {view === 'detail' && selectedCert && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => { setView('overview'); setEvalMode(null); }} className="text-slate-600">← Back to Team</Button>

                <Card className="p-6 bg-[#1A1A1A] border-[#B8956A]/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-[#FFFBF5]">{selectedCert.sales_member_name}</h2>
                      <p className="text-sm text-[#FFFBF5]/60">{selectedCert.sales_member_email}</p>
                    </div>
                    <Badge className={STATUS_COLORS[selectedCert.training_status]}>
                      {selectedCert.training_status?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </Card>

                {/* Calling Authorization Controls */}
                <Card className="p-6 bg-white border-[#B8956A]/15">
                  <h3 className="font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2"><Phone className="w-5 h-5 text-[#B8956A]" /> Calling Authorization</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.values(CALLING_AUTH).map(level => (
                      <Button key={level}
                        size="sm"
                        variant={selectedCert.calling_authorization === level ? "default" : "outline"}
                        className={selectedCert.calling_authorization === level ? "bg-[#B8956A] text-[#1A1A1A]" : "border-[#B8956A]/30"}
                        onClick={() => handleSetCallingAuth(selectedCert, level)}>
                        {level.replace(/_/g, ' ')}
                      </Button>
                    ))}
                  </div>
                </Card>

                {/* Evaluation Actions */}
                {!evalMode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="p-6 bg-white border-[#B8956A]/15">
                      <h3 className="font-semibold text-[#1A1A1A] mb-2">Role-Play Evaluation</h3>
                      <p className="text-sm text-slate-500 mb-4">Current score: {selectedCert.roleplay_score || "Not evaluated"} {selectedCert.roleplay_passed && "✓"}</p>
                      <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setEvalMode('roleplay')}>
                        Evaluate Role-Play
                      </Button>
                    </Card>
                    <Card className="p-6 bg-white border-[#B8956A]/15">
                      <h3 className="font-semibold text-[#1A1A1A] mb-2">Independent Practicum</h3>
                      <p className="text-sm text-slate-500 mb-4">Current score: {selectedCert.practicum_score || "Not evaluated"} {selectedCert.practicum_passed && "✓"}</p>
                      <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => setEvalMode('practicum')}>
                        Evaluate Practicum
                      </Button>
                    </Card>
                  </div>
                )}

                {evalMode && (
                  <EvaluationForm
                    mode={evalMode}
                    cert={selectedCert}
                    admin={admin}
                    onDone={async () => { await loadCertifications(); setEvalMode(null); setSelectedCert(null); setView('overview'); }}
                    onCancel={() => setEvalMode(null)}
                  />
                )}

                {/* Certification Actions */}
                {!evalMode && (
                  <Card className="p-6 bg-white border-[#B8956A]/15">
                    <h3 className="font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-[#B8956A]" /> Certification Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      {selectedCert.training_status !== TRAINING_STATUS.SALES_CERTIFIED && (
                        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={() => handleCertify(selectedCert)}>
                          <Award className="w-4 h-4 mr-2" /> Certify Rep
                        </Button>
                      )}
                      {selectedCert.training_status === TRAINING_STATUS.SALES_CERTIFIED && (
                        <Button variant="destructive" onClick={() => handleSuspend(selectedCert)}>
                          <AlertTriangle className="w-4 h-4 mr-2" /> Suspend
                        </Button>
                      )}
                      {selectedCert.training_status === TRAINING_STATUS.CERTIFICATION_SUSPENDED && (
                        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleRestore(selectedCert)}>
                          <CheckCircle2 className="w-4 h-4 mr-2" /> Restore
                        </Button>
                      )}
                    </div>
                    {(selectedCert.critical_failures || []).length > 0 && (
                      <div className="mt-4 p-3 bg-red-50 rounded-lg">
                        <p className="text-sm font-medium text-red-700 mb-1">Active Critical Failures:</p>
                        <ul className="text-sm text-red-600">{(selectedCert.critical_failures || []).map(f => <li key={f}>• {f.replace(/_/g, ' ')}</li>)}</ul>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }) {
  return (
    <Card className="p-4 bg-white border-[#B8956A]/15">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: color || '#B8956A' }} />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-[#1A1A1A]">{value}</p>
    </Card>
  );
}

function ReqRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-[#1A1A1A]">{value}</span>
    </div>
  );
}

// ─── Evaluation Form (Role-Play / Practicum) ───────────────────────────────
function EvaluationForm({ mode, cert, admin, onDone, onCancel }) {
  const rubric = mode === 'roleplay' ? ROLEPLAY_RUBRIC : PRACTICUM_RUBRIC;
  const [scores, setScores] = useState({});
  const [criticalFailures, setCriticalFailures] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const maxScore = rubric.categories.reduce((sum, c) => sum + c.points, 0);
  const passed = totalScore >= rubric.passing_score && criticalFailures.length === 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const attempt = await base44.entities.TrainingAttempt.create({
        sales_member_id: cert.sales_member_id,
        sales_member_email: cert.sales_member_email,
        attempt_type: mode === 'roleplay' ? "ROLEPLAY" : "PRACTICUM",
        score: totalScore,
        passed,
        total_questions: maxScore,
        correct_answers: totalScore,
        product_truth_version: cert.product_truth_version || "v1",
        roleplay_scores: mode === 'roleplay' ? scores : undefined,
        practicum_scores: mode === 'practicum' ? scores : undefined,
        critical_failures_detected: criticalFailures,
        evaluator: admin.name,
        started_at: now,
        completed_at: now,
      });

      const updateData = mode === 'roleplay'
        ? { roleplay_score: totalScore, roleplay_passed: passed, roleplay_completed_at: now, roleplay_evaluator: admin.name, critical_failures: criticalFailures }
        : { practicum_score: totalScore, practicum_passed: passed, practicum_completed_at: now, practicum_evaluator: admin.name, critical_failures: criticalFailures };

      await base44.entities.SalesCertification.update(cert.id, updateData);

      await base44.entities.AuditEvent.create({
        event_type: passed ? (mode === 'roleplay' ? "ROLEPLAY_PASSED" : "PRACTICUM_PASSED") : (mode === 'roleplay' ? "ROLEPLAY_FAILED" : "PRACTICUM_FAILED"),
        sales_member_id: cert.sales_member_id,
        sales_member_name: cert.sales_member_name,
        actor_id: admin.id, actor_name: admin.name, actor_role: "ADMIN",
        entity_type: "TrainingAttempt", entity_id: attempt.id,
        details: { score: totalScore, passed, critical_failures: criticalFailures },
        timestamp: now,
      });

      onDone();
    } catch (err) { console.error("Evaluation failed:", err); }
    finally { setSubmitting(false); }
  };

  return (
    <Card className="p-6 bg-white border-[#B8956A]/15">
      <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">{mode === 'roleplay' ? "Role-Play Evaluation" : "Independent Practicum Evaluation"}</h3>
      <p className="text-sm text-slate-500 mb-4">Rep: {cert.sales_member_name} • Passing score: {rubric.passing_score}/{rubric.total_points}</p>

      <div className="space-y-4 mb-6">
        {rubric.categories.map(cat => (
          <div key={cat.key} className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-[#1A1A1A]">{cat.label}</label>
              <p className="text-xs text-slate-400">Max: {cat.points} points</p>
            </div>
            <Input
              type="number"
              min={0}
              max={cat.points}
              value={scores[cat.key] || ""}
              onChange={e => setScores({ ...scores, [cat.key]: e.target.value })}
              className="w-24 text-right"
              placeholder="0"
            />
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-50 rounded-lg flex items-center justify-between mb-6">
        <span className="font-semibold text-[#1A1A1A]">Total Score</span>
        <span className={`text-2xl font-bold ${passed ? 'text-[#B8956A]' : 'text-red-600'}`}>{totalScore}/{maxScore}</span>
      </div>

      <div className="mb-4">
        <label className="text-sm font-semibold text-[#1A1A1A] mb-2 block">Critical Failures (if any)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CRITICAL_FAILURES.map(f => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={criticalFailures.includes(f)} onChange={e => {
                if (e.target.checked) setCriticalFailures([...criticalFailures, f]);
                else setCriticalFailures(criticalFailures.filter(c => c !== f));
              }} className="accent-red-500" />
              <span className="text-slate-700">{f.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="text-sm font-semibold text-[#1A1A1A] mb-2 block">Evaluation Notes</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Feedback for the rep..." />
      </div>

      {criticalFailures.length > 0 && (
        <div className="mb-6 p-3 bg-red-50 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-sm text-red-700">Critical failures will override the score and require remediation.</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Saving..." : "Submit Evaluation"}
        </Button>
      </div>
    </Card>
  );
}