import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Users, GitCompare, Briefcase, FileText, Trash2 } from "lucide-react";
import RoleProfileCard from "@/components/hireiq/RoleProfileCard";
import CandidateForm from "@/components/hireiq/CandidateForm";
import RankingTable from "@/components/hireiq/RankingTable";
import ImportApplicationsModal from "@/components/hireiq/ImportApplicationsModal";
import QuestionnaireUploader from "@/components/hireiq/QuestionnaireUploader";
import WorkflowStepper from "@/components/hireiq/WorkflowStepper";
import { evaluateCandidate, analyzeResumeText } from "@/lib/hireiq";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const innerBg = "#2A2A2A";

const statusStyle = (s) => ({
  draft: { bg: "#2A2A2A", text: "rgba(255,251,245,0.7)" },
  open: { bg: "#B8956A", text: "#1A1A1A" },
  closed: { bg: "rgba(220,38,38,0.2)", text: "#FCA5A5" },
  filled: { bg: "#A68559", text: "#FFFBF5" },
}[s] || { bg: "rgba(255,251,245,0.08)", text: "rgba(255,251,245,0.6)" });

function computeStep(job, candidates) {
  if (candidates.some(c => c.status === "hired")) return 10;
  if (candidates.some(c => c.decision === "offer")) return 9;
  if (candidates.some(c => c.decision && c.decision !== "pending")) return 8;
  if (candidates.some(c => c.evaluation)) return 7;
  if (candidates.some(c => c.status === "interviewing" || c.status === "advanced")) return 6;
  if (candidates.some(c => c.resume_analysis)) return 5;
  if (candidates.length > 0) return 4;
  if (job?.scorecard_template?.length > 0) return 3;
  if (job?.role_profile_approved || job?.role_success_profile) return 2;
  return 1;
}

export default function JobDetailPanel({ job, linkedOpening, onBack, onSelectCandidate, onCompare, onJobUpdated, onDelete, initialTab, preselectedCandidateId }) {
  // Overview content prefers the linked JobOpening (the public listing page),
  // falling back to the HireJob's own fields when no opening is linked.
  const overview = {
    description: linkedOpening?.description_text || job?.description,
    responsibilities: linkedOpening?.responsibilities || job?.responsibilities || [],
    required_qualifications: linkedOpening?.required_qualifications || job?.required_qualifications || [],
    preferred_qualifications: linkedOpening?.preferred_qualifications || job?.preferred_qualifications || [],
    skills: linkedOpening?.skills || job?.skills || [],
    experience_requirements: linkedOpening?.experience_requirements || job?.experience_requirements,
    compensation: linkedOpening?.compensation || job?.compensation,
    work_schedule: linkedOpening?.work_schedule || job?.work_schedule,
    performance_expectations: linkedOpening?.performance_expectations || job?.performance_expectations,
    benefits: linkedOpening?.benefits || [],
    location: linkedOpening?.location || job?.location,
    employment_type: linkedOpening?.employment_type || job?.employment_type,
    work_arrangement: linkedOpening?.work_arrangement || job?.work_arrangement,
  };
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState(initialTab || "overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [evaluatingAll, setEvaluatingAll] = useState(false);

  const loadCandidates = async () => {
    if (!job?.id) return;
    setLoadingCandidates(true);
    try {
      const res = await base44.entities.HireCandidate.filter({ job_id: job.id }, "-created_date", 100);
      const list = res?.data ?? res;
      // Hide archived (declined) candidates from all job views
      setCandidates((Array.isArray(list) ? list : []).filter(c => !c.archived && c.status !== "declined"));
    } catch (_) { setCandidates([]); }
    setLoadingCandidates(false);
  };

  useEffect(() => { loadCandidates(); }, [job?.id]);

  const updateJob = async (data) => {
    const res = await base44.entities.HireJob.update(job.id, data);
    const updated = res?.data ?? res;
    onJobUpdated(updated);
  };

  const updateCandidate = async (candidateId, data) => {
    const res = await base44.entities.HireCandidate.update(candidateId, data);
    const updated = res?.data ?? res;
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, ...updated } : c));
  };

  const handleCandidateCreated = (candidate) => {
    setCandidates(prev => [candidate, ...prev]);
    setShowAddCandidate(false);
    setShowImport(false);
  };

  const setStatus = async (status) => { await updateJob({ status }); };

  const handleEvaluateAll = async () => {
    const unevaluated = candidates.filter(c => !c.evaluation);
    if (unevaluated.length === 0) return;
    setEvaluatingAll(true);
    for (const c of unevaluated) {
      try {
        let analysis = c.resume_analysis;
        if (!analysis && c.resume_text) {
          analysis = await analyzeResumeText(c.resume_text, job, job?.role_success_profile);
        }
        const evaluation = await evaluateCandidate(c, job, job?.role_success_profile, [], analysis);
        const updateData = { evaluation };
        if (analysis && !c.resume_analysis) updateData.resume_analysis = analysis;
        await base44.entities.HireCandidate.update(c.id, updateData);
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, ...updateData } : x));
      } catch (_) {}
    }
    setEvaluatingAll(false);
  };

  const roleProfile = job?.role_success_profile;
  const currentStep = computeStep(job, candidates);

  const tabs = [
    { id: "overview", label: "Overview", icon: Briefcase },
    { id: "profile", label: "Role Success Profile", icon: Users },
    { id: "questionnaire", label: "Questionnaire", icon: FileText },
    { id: "candidates", label: `Candidates (${candidates.length})`, icon: Users },
    { id: "ranking", label: "Ranking", icon: Users },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Job header card */}
      <div className="p-5 mb-5" style={card}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: CREAM }}>{job?.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED_LIGHT }}>{job?.department}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={statusStyle(job?.status)}>{job?.status}</span>
            <select className="rounded-lg px-3 py-1.5 text-sm" style={{ borderColor: "rgba(184,149,106,0.2)", backgroundColor: "#2A2A2A", color: CREAM }}
              value={job?.status || "draft"} onChange={e => setStatus(e.target.value)}>
              <option value="draft" style={{ color: "#1A1A1A" }}>Draft</option>
              <option value="open" style={{ color: "#1A1A1A" }}>Open</option>
              <option value="closed" style={{ color: "#1A1A1A" }}>Closed</option>
              <option value="filled" style={{ color: "#1A1A1A" }}>Filled</option>
            </select>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: "#FCA5A5" }}>Delete this job?</span>
                <Button size="sm" disabled={deleting} onClick={async () => { setDeleting(true); await onDelete?.(job); setDeleting(false); }} style={{ backgroundColor: "#DC2626", color: "#FFFBF5", border: "none", fontWeight: 600 }}>
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                </Button>
                <Button size="sm" variant="outline" disabled={deleting} onClick={() => setConfirmDelete(false)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)} style={{ backgroundColor: "transparent", color: "#FCA5A5", border: "1px solid rgba(220,38,38,0.3)" }}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
          </div>
        </div>
        <div className="pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED_LIGHT }}>Application Link</p>
          <div className="flex items-center gap-2">
            <input readOnly value={`${window.location.origin}/JobApplication?job=${job?.id || ''}`} className="flex-1 text-xs px-3 py-1.5 rounded" style={{ backgroundColor: innerBg, color: CREAM, border: "1px solid rgba(184,149,106,0.12)" }} />
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/JobApplication?job=${job?.id || ''}`)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Copy</Button>
          </div>
        </div>
        <div className="pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED_LIGHT }}>Hiring Pipeline Progress</p>
          <WorkflowStepper currentStep={currentStep} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all"
              style={{
                backgroundColor: active ? "#1A1A1A" : "transparent",
                color: active ? GOLD : MUTED_DARK,
                border: active ? "1px solid rgba(184,149,106,0.2)" : "1px solid transparent",
                boxShadow: active ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
              }}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-5" style={card}>
        {tab === "overview" && (
          <div className="space-y-4">
            {!overview.description && !overview.responsibilities.length && !overview.required_qualifications.length && !overview.preferred_qualifications.length && !overview.skills.length && !overview.experience_requirements && !overview.compensation && !overview.work_schedule && !overview.benefits.length ? (
              <p className="text-sm text-center py-8" style={{ color: MUTED_LIGHT }}>No listing content linked. Use "Edit Page" to connect a job page.</p>
            ) : (
              <>
            {overview.description && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Description</p><p className="text-sm whitespace-pre-wrap" style={{ color: CREAM }}>{overview.description}</p></div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overview.responsibilities.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Responsibilities</p><ul className="text-sm space-y-0.5" style={{ color: CREAM }}>{overview.responsibilities.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {overview.required_qualifications.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Required Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: CREAM }}>{overview.required_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {overview.preferred_qualifications.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Preferred Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: CREAM }}>{overview.preferred_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {overview.skills.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Skills</p><div className="flex flex-wrap gap-1">{overview.skills.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: innerBg, color: CREAM }}>{s}</span>)}</div></div>}
            </div>
            {overview.benefits.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Benefits</p><ul className="text-sm space-y-0.5" style={{ color: CREAM }}>{overview.benefits.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
              {overview.experience_requirements && <div><p className="text-xs" style={{ color: MUTED_LIGHT }}>Experience</p><p style={{ color: CREAM }}>{overview.experience_requirements}</p></div>}
              {overview.compensation && <div><p className="text-xs" style={{ color: MUTED_LIGHT }}>Compensation</p><p style={{ color: CREAM }}>{overview.compensation}</p></div>}
              {overview.work_schedule && <div><p className="text-xs" style={{ color: MUTED_LIGHT }}>Schedule</p><p style={{ color: CREAM }}>{overview.work_schedule}</p></div>}
              {overview.performance_expectations && <div><p className="text-xs" style={{ color: MUTED_LIGHT }}>Performance Expectations</p><p style={{ color: CREAM }}>{overview.performance_expectations}</p></div>}
            </div>
              </>
            )}
          </div>
        )}

        {tab === "profile" && <RoleProfileCard job={job} onUpdate={updateJob} />}

        {tab === "questionnaire" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold mb-1" style={{ ...SERIF, color: CREAM }}>Interview Scorecards</h3>
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>Select an applicant to fill out or download their Round 1 and Round 2 scorecards. Round 2 questions are AI-generated from your job description.</p>
            </div>
            <QuestionnaireUploader job={job} candidates={candidates} onUpdateJob={updateJob} onUpdateCandidate={updateCandidate} preselectedCandidateId={preselectedCandidateId} />
          </div>
        )}

        {tab === "candidates" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-bold" style={{ ...SERIF, color: CREAM }}>Candidates</h3>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowImport(true)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><FileText className="w-4 h-4 mr-2" /> Import</Button>
                <Button variant="outline" onClick={onCompare} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><GitCompare className="w-4 h-4 mr-2" /> Compare</Button>
                <Button onClick={() => setShowAddCandidate(true)} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}><Plus className="w-4 h-4 mr-2" /> Add Candidate</Button>
              </div>
            </div>
            {showAddCandidate && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.12)" }}>
                <CandidateForm jobId={job.id} jobData={job} roleProfile={roleProfile} onCreated={handleCandidateCreated} onCancel={() => setShowAddCandidate(false)} />
              </div>
            )}
            {showImport && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.12)" }}>
                <ImportApplicationsModal jobId={job.id} jobData={job} roleProfile={roleProfile} onImported={handleCandidateCreated} onCancel={() => setShowImport(false)} />
              </div>
            )}
            {loadingCandidates ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} /></div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: MUTED_LIGHT }}>No candidates yet</p>
            ) : (
              <div className="space-y-2">
                {candidates.map(c => (
                  <div key={c.id} onClick={() => onSelectCandidate(c)}
                    className="p-3 cursor-pointer flex justify-between items-center rounded-lg transition-all hover:translate-x-0.5"
                    style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.1)" }}>
                    <div>
                      <p className="font-medium" style={{ color: CREAM }}>{c.name}</p>
                      <p className="text-xs" style={{ color: MUTED_LIGHT }}>{c.email} · {c.status}</p>
                    </div>
                    {c.evaluation?.estimated_success_score != null && (
                      <span className="text-lg font-bold" style={{ color: GOLD, fontFamily: "'SF Mono', 'Monaco', monospace" }}>{Math.round(c.evaluation.estimated_success_score)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "ranking" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={onCompare} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><GitCompare className="w-4 h-4 mr-2" /> Compare Candidates</Button>
            </div>
            <RankingTable candidates={candidates} jobId={job.id} onSelectCandidate={onSelectCandidate} onEvaluateAll={handleEvaluateAll} evaluating={evaluatingAll} />
          </div>
        )}
      </div>
    </div>
  );
}