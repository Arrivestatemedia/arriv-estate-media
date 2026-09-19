import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  ClipboardList, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Shield, Lock, Unlock,
  Award, MessageSquare, Ban, RotateCcw, Send, AlertOctagon, User, ChevronDown, ChevronUp,
} from "lucide-react";
import { CERTIFICATION_DOMAINS, getCriticalFailureLabel, KNOWLEDGE_BANK_VERSION } from "@/lib/certificationRubrics";
import ReadinessChecklist from "./ReadinessChecklist";
import DomainStatusGrid from "./DomainStatusGrid";
import PracticalScoreModal from "./PracticalScoreModal";

export default function ManagerReview({ learnerId, isAdmin }) {
  const [learners, setLearners] = useState([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState(learnerId || null);
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("all");
  const [showCoachingForm, setShowCoachingForm] = useState(false);
  const [coachingNote, setCoachingNote] = useState("");
  const [coachingDomain, setCoachingDomain] = useState("general");
  const [showScoreModal, setShowScoreModal] = useState(null); // practicalType or null
  const [showIntervene, setShowIntervene] = useState(false);
  const [interventionReason, setInterventionReason] = useState("");
  const [expandedSections, setExpandedSections] = useState({ readiness: true, timeline: true, coaching: true });

  const loadLearners = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const result = await base44.entities.SalesTeamMember.list("-created_date", 200);
      setLearners(result || []);
    } catch (e) { console.error("Failed to load learners:", e); }
  }, [isAdmin]);

  const loadStatus = useCallback(async () => {
    if (!selectedLearnerId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageCertificationAuthorization", {
        action: "get_status",
        sales_member_id: selectedLearnerId,
      });
      setStatusData(res?.data || res);
    } catch (e) {
      console.error("Failed to load certification status:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedLearnerId]);

  useEffect(() => { loadLearners(); }, [loadLearners]);
  useEffect(() => { if (selectedLearnerId) loadStatus(); }, [selectedLearnerId, loadStatus]);
  useEffect(() => { if (!selectedLearnerId && learnerId) setSelectedLearnerId(learnerId); }, [learnerId, selectedLearnerId]);

  const callApi = async (payload) => {
    try {
      const res = await base44.functions.invoke("manageCertificationAuthorization", {
        ...payload,
        sales_member_id: selectedLearnerId,
      });
      if (res?.data?.error) {
        alert(res.data.error);
      } else {
        await loadStatus();
      }
      return res?.data;
    } catch (e) {
      console.error("API call failed:", e);
      alert("Action failed: " + (e.message || "unknown error"));
    }
  };

  const handleAddCoaching = async () => {
    if (!coachingNote.trim()) return;
    await callApi({ action: "add_coaching_note", note: coachingNote, domain: coachingDomain });
    setCoachingNote("");
    setShowCoachingForm(false);
  };

  const handleScoreSubmit = async (payload) => {
    await callApi({ action: "record_practical_score", ...payload });
  };

  const handleAuthorize = async () => {
    if (!confirm("Authorize this learner for ARRIV CERTIFIED status and independent calling?\n\nAutomated scores do NOT authorize — this is an explicit manager authorization.")) return;
    await callApi({ action: "authorize_certification" });
  };

  const handleSuspend = async () => {
    const reason = prompt("Reason for suspension?");
    if (!reason) return;
    await callApi({ action: "suspend_certification", reason });
  };

  const handleRestore = async () => {
    const reason = prompt("Reason for restoration?");
    if (!reason) return;
    await callApi({ action: "restore_certification", reason });
  };

  const handleLockCalling = async () => {
    const reason = prompt("Reason for locking calling?");
    if (!reason) return;
    await callApi({ action: "lock_calling", reason });
  };

  const handleUnlockSupervised = async () => {
    const reason = prompt("Reason for unlocking supervised calling?");
    if (!reason) return;
    await callApi({ action: "unlock_supervised_calling", reason });
  };

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const cert = statusData?.certification;
  const readiness = statusData?.readiness;
  const domains = statusData?.domains;
  const events = statusData?.simulation_events || [];
  const criticalMisses = statusData?.critical_misses || [];
  const coachingNotes = cert?.manager_coaching_notes || [];
  const interventions = cert?.manager_interventions || [];
  const remediationModules = cert?.remediation_modules || [];

  const filteredEvents = eventFilter === "all" ? events : events.filter(e => e.validation_result === eventFilter);

  const eventStats = {
    total: events.length,
    correct: events.filter(e => e.validation_result === "correct").length,
    warnings: events.filter(e => e.validation_result === "warning").length,
    failures: criticalMisses.length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-[#1A1A1A] flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#B8956A]" /> Manager Review Dashboard
        </h3>
        <div className="flex items-center gap-2">
          {isAdmin && learners.length > 0 && (
            <select
              value={selectedLearnerId || ""}
              onChange={e => setSelectedLearnerId(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[#B8956A]/30 rounded-lg bg-white focus:outline-none focus:border-[#B8956A]"
            >
              <option value="">Select learner...</option>
              {learners.map(l => <option key={l.id} value={l.id}>{l.full_name} ({l.email})</option>)}
            </select>
          )}
          <button onClick={loadStatus} disabled={!selectedLearnerId || loading} className="p-2 rounded-lg hover:bg-[#B8956A]/10 text-[#B8956A] disabled:opacity-30">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {!selectedLearnerId ? (
        <div className="text-center py-12 text-[#1A1A1A]/40 text-sm">Select a learner to view their certification status.</div>
      ) : loading ? (
        <div className="text-center py-12 text-[#1A1A1A]/40 text-sm">Loading certification status...</div>
      ) : !cert ? (
        <div className="text-center py-12 text-[#1A1A1A]/40 text-sm">No certification record found.</div>
      ) : (
        <>
          {/* Status banner */}
          <div className={`p-4 rounded-xl border ${
            cert.training_status === "SALES_CERTIFIED" ? "bg-emerald-50 border-emerald-200" :
            cert.training_status === "CERTIFICATION_SUSPENDED" ? "bg-red-50 border-red-200" :
            cert.training_status === "REMEDIATION_REQUIRED" ? "bg-amber-50 border-amber-200" :
            "bg-[#B8956A]/10 border-[#B8956A]/20"
          }`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  {cert.training_status === "SALES_CERTIFIED" ? <Award className="w-5 h-5 text-emerald-600" /> :
                    cert.training_status === "CERTIFICATION_SUSPENDED" ? <Ban className="w-5 h-5 text-red-500" /> :
                    <Shield className="w-5 h-5 text-[#B8956A]" />}
                  <span className="font-medium text-[#1A1A1A]">{cert.sales_member_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    cert.training_status === "SALES_CERTIFIED" ? "bg-emerald-100 text-emerald-700" :
                    cert.training_status === "CERTIFICATION_SUSPENDED" ? "bg-red-100 text-red-700" :
                    "bg-[#B8956A]/15 text-[#B8956A]"
                  }`}>{cert.training_status.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-[#1A1A1A]/50 mt-1">
                  Calling: <strong>{cert.calling_authorization?.replace(/_/g, " ")}</strong>
                  {cert.certified_by && <> · Authorized by {cert.certified_by} on {new Date(cert.certified_at).toLocaleDateString()}</>}
                  {" · "}KB v{cert.knowledge_bank_version || KNOWLEDGE_BANK_VERSION}
                </p>
              </div>
              {cert.training_status === "SALES_CERTIFIED" && cert.certified_domains?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {cert.certified_domains.map(d => <span key={d} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{d}</span>)}
                </div>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2 rounded-lg bg-[#1A1A1A]/5 text-center"><p className="text-xs text-[#1A1A1A]/60">Modules</p><p className="text-lg font-bold text-[#1A1A1A]">{cert.modules_passed_count || 0}/20</p></div>
            <div className="p-2 rounded-lg bg-[#1A1A1A]/5 text-center"><p className="text-xs text-[#1A1A1A]/60">Quiz Avg</p><p className="text-lg font-bold text-[#1A1A1A]">{(cert.quiz_average_score || 0).toFixed(0)}%</p></div>
            <div className="p-2 rounded-lg bg-amber-50 text-center"><p className="text-xs text-amber-700">Critical Misses</p><p className="text-lg font-bold text-amber-600">{criticalMisses.length}</p></div>
            <div className="p-2 rounded-lg bg-red-50 text-center"><p className="text-xs text-red-700">Active Failures</p><p className="text-lg font-bold text-red-600">{(cert.critical_failures || []).length}</p></div>
          </div>

          {/* Manager actions */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              {readiness?.ready_for_authorization && cert.training_status !== "SALES_CERTIFIED" && (
                <button onClick={handleAuthorize} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                  <Award className="w-4 h-4" /> Authorize Certification
                </button>
              )}
              <button onClick={() => setShowScoreModal("roleplay")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-[#B8956A] text-sm font-medium hover:bg-[#B8956A]/5">
                <Award className="w-4 h-4" /> Score Role-Play
              </button>
              <button onClick={() => setShowScoreModal("system_crm")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-[#B8956A] text-sm font-medium hover:bg-[#B8956A]/5">
                <Award className="w-4 h-4" /> Score CRM/System
              </button>
              <button onClick={() => setShowScoreModal("onboarding")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-[#B8956A] text-sm font-medium hover:bg-[#B8956A]/5">
                <Award className="w-4 h-4" /> Score Onboarding
              </button>
              <button onClick={() => setShowScoreModal("teachback")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-[#B8956A] text-sm font-medium hover:bg-[#B8956A]/5">
                <Award className="w-4 h-4" /> Score Teach-Back
              </button>
              <button onClick={() => setShowCoachingForm(!showCoachingForm)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-[#B8956A] text-sm font-medium hover:bg-[#B8956A]/5">
                <MessageSquare className="w-4 h-4" /> Coaching Note
              </button>
              <button onClick={handleLockCalling} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
                <Lock className="w-4 h-4" /> Lock Calling
              </button>
              <button onClick={handleUnlockSupervised} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 text-amber-600 text-sm font-medium hover:bg-amber-50">
                <Unlock className="w-4 h-4" /> Supervised Calling
              </button>
              {cert.training_status === "SALES_CERTIFIED" ? (
                <button onClick={handleSuspend} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
                  <Ban className="w-4 h-4" /> Suspend
                </button>
              ) : cert.training_status === "CERTIFICATION_SUSPENDED" ? (
                <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-600 text-sm font-medium hover:bg-emerald-50">
                  <RotateCcw className="w-4 h-4" /> Restore
                </button>
              ) : null}
            </div>
          )}

          {/* Coaching note form */}
          {showCoachingForm && isAdmin && (
            <div className="p-3 rounded-lg border border-[#B8956A]/20 bg-white space-y-2">
              <textarea
                value={coachingNote}
                onChange={e => setCoachingNote(e.target.value)}
                rows={3}
                placeholder="Coaching note for the learner..."
                className="w-full px-3 py-2 text-sm border border-[#B8956A]/30 rounded-lg focus:outline-none focus:border-[#B8956A]"
              />
              <div className="flex items-center gap-2">
                <select value={coachingDomain} onChange={e => setCoachingDomain(e.target.value)} className="px-2 py-1 text-sm border border-[#B8956A]/30 rounded-lg bg-white">
                  <option value="general">General</option>
                  {CERTIFICATION_DOMAINS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  <option value="critical_failure">Critical Failure</option>
                  <option value="remediation">Remediation</option>
                </select>
                <button onClick={handleAddCoaching} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B8956A] text-white text-sm font-medium hover:bg-[#A68559]">
                  <Send className="w-3.5 h-3.5" /> Add Note
                </button>
              </div>
            </div>
          )}

          {/* ARRIV CERTIFIED domains */}
          <Section title="Certification Domains (ARRIV CERTIFIED)" expanded={expandedSections.domains} onToggle={() => toggleSection("domains")}>
            <DomainStatusGrid domains={domains} certifiedDomains={cert.certified_domains} />
          </Section>

          {/* Authorization Readiness */}
          <Section title="Authorization Readiness" expanded={expandedSections.readiness} onToggle={() => toggleSection("readiness")}>
            <ReadinessChecklist readiness={readiness} />
          </Section>

          {/* Critical Misses */}
          {criticalMisses.length > 0 && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <h4 className="text-sm font-medium text-red-700 flex items-center gap-1.5 mb-2"><AlertOctagon className="w-4 h-4" /> Critical Misses ({criticalMisses.length})</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {criticalMisses.map(m => (
                  <div key={m.event_id} className="text-xs text-red-600 p-1.5 bg-white rounded">
                    <strong>{m.action}</strong> · {m.scenario_id} · {new Date(m.timestamp).toLocaleString()}
                    {m.validation_notes && <p className="text-red-500 mt-0.5">{m.validation_notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active critical failures */}
          {(cert.critical_failures || []).length > 0 && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50">
              <h4 className="text-sm font-medium text-red-700 mb-2">Active Critical Failures</h4>
              <div className="flex flex-wrap gap-1">
                {cert.critical_failures.map(f => <span key={f} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{getCriticalFailureLabel(f)}</span>)}
              </div>
            </div>
          )}

          {/* Remediation */}
          {remediationModules.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <h4 className="text-sm font-medium text-amber-700 mb-2">Remediation Modules ({remediationModules.length})</h4>
              <div className="flex flex-wrap gap-1">
                {remediationModules.map(m => (
                  <span key={m} className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {m}
                    {isAdmin && <button onClick={async () => { await callApi({ action: "clear_remediation", module_id: m }); }} className="hover:text-amber-900"><XCircle className="w-3 h-3" /></button>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Simulation Event Timeline */}
          <Section title={`Simulation Event Timeline (${eventStats.total})`} expanded={expandedSections.timeline} onToggle={() => toggleSection("timeline")}>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-center"><p className="text-xs text-emerald-700">Correct</p><p className="text-base font-bold text-emerald-600">{eventStats.correct}</p></div>
              <div className="p-2 rounded-lg bg-amber-50 text-center"><p className="text-xs text-amber-700">Warnings</p><p className="text-base font-bold text-amber-600">{eventStats.warnings}</p></div>
              <div className="p-2 rounded-lg bg-red-50 text-center"><p className="text-xs text-red-700">Failures</p><p className="text-base font-bold text-red-600">{eventStats.failures}</p></div>
              <div className="p-2 rounded-lg bg-[#1A1A1A]/5 text-center"><p className="text-xs text-[#1A1A1A]/60">Total</p><p className="text-base font-bold text-[#1A1A1A]">{eventStats.total}</p></div>
            </div>
            <div className="flex gap-1.5 mb-2">
              {["all", "correct", "warning", "critical_failure"].map(f => (
                <button key={f} onClick={() => setEventFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium ${eventFilter === f ? "bg-[#B8956A] text-white" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/60"}`}>
                  {f === "all" ? "All" : f.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredEvents.length === 0 ? (
                <p className="text-center py-4 text-sm text-[#1A1A1A]/40">No events for this filter.</p>
              ) : filteredEvents.map(evt => (
                <div key={evt.event_id} className="p-2.5 rounded-lg border border-[#B8956A]/15 bg-white text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {evt.validation_result === "correct" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                        evt.validation_result === "critical_failure" ? <XCircle className="w-4 h-4 text-red-500" /> :
                        <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      <span className="font-medium text-[#1A1A1A] text-xs">{evt.action}</span>
                    </div>
                    <span className="text-xs text-[#1A1A1A]/40">{new Date(evt.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-[#1A1A1A]/50">{evt.scenario_id} · {evt.screen} · {evt.level?.replace(/_/g, " ")}</p>
                  {evt.validation_notes && <p className="text-xs text-[#1A1A1A]/40 mt-1">{evt.validation_notes}</p>}
                </div>
              ))}
            </div>
          </Section>

          {/* Coaching Notes */}
          <Section title={`Coaching Notes (${coachingNotes.length})`} expanded={expandedSections.coaching} onToggle={() => toggleSection("coaching")}>
            {coachingNotes.length === 0 ? (
              <p className="text-center py-4 text-sm text-[#1A1A1A]/40">No coaching notes yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {[...coachingNotes].reverse().map(note => (
                  <div key={note.note_id} className="p-2.5 rounded-lg border border-[#B8956A]/15 bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[#B8956A]">{note.domain} · {note.created_by}</span>
                      <span className="text-xs text-[#1A1A1A]/40">{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-[#1A1A1A]">{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Intervention Log */}
          {interventions.length > 0 && (
            <Section title={`Manager Intervention Log (${interventions.length})`} expanded={false} onToggle={() => toggleSection("interventions")}>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {[...interventions].reverse().map(iv => (
                  <div key={iv.intervention_id} className="p-2 rounded-lg border border-[#1A1A1A]/10 bg-[#1A1A1A]/5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#1A1A1A]">{iv.type.replace(/_/g, " ")}</span>
                      <span className="text-[#1A1A1A]/40">{new Date(iv.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-[#1A1A1A]/60 mt-0.5">{iv.reason}</p>
                    <p className="text-[#B8956A] mt-0.5">by {iv.manager_name}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Practical Score Modal */}
      <PracticalScoreModal
        open={!!showScoreModal}
        practicalType={showScoreModal}
        learnerName={cert?.sales_member_name || ""}
        onClose={() => setShowScoreModal(null)}
        onSubmit={handleScoreSubmit}
      />
    </div>
  );
}

function Section({ title, expanded, onToggle, children }) {
  return (
    <div className="border border-[#B8956A]/20 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-3 bg-white hover:bg-[#B8956A]/5">
        <span className="text-sm font-medium text-[#1A1A1A]">{title}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-[#1A1A1A]/40" /> : <ChevronDown className="w-4 h-4 text-[#1A1A1A]/40" />}
      </button>
      {expanded && <div className="p-3 bg-white border-t border-[#B8956A]/10">{children}</div>}
    </div>
  );
}