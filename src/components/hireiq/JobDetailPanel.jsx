import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Users, GitCompare, Briefcase, FileText } from "lucide-react";
import RoleProfileCard from "@/components/hireiq/RoleProfileCard";
import CandidateForm from "@/components/hireiq/CandidateForm";
import RankingTable from "@/components/hireiq/RankingTable";
import ImportApplicationsModal from "@/components/hireiq/ImportApplicationsModal";
import QuestionnaireUploader from "@/components/hireiq/QuestionnaireUploader";
import WorkflowStepper from "@/components/hireiq/WorkflowStepper";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.45)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: CREAM,
  border: "1px solid rgba(184,149,106,0.12)",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

const innerBg = "#F5F2EC";

const statusStyle = (s) => ({
  draft: { bg: "#E8E5E0", text: "#6B6B6B" },
  open: { bg: "#B8956A", text: "#FFFBF5" },
  closed: { bg: "#FEE2E2", text: "#991B1B" },
  filled: { bg: "#A68559", text: "#FFFBF5" },
}[s] || { bg: "#E8E5E0", text: "#6B6B6B" });

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

export default function JobDetailPanel({ job, onBack, onSelectCandidate, onCompare, onJobUpdated }) {
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState("overview");

  const loadCandidates = async () => {
    if (!job?.id) return;
    setLoadingCandidates(true);
    try {
      const res = await base44.entities.HireCandidate.filter({ job_id: job.id }, "-created_date", 100);
      const list = res?.data ?? res;
      setCandidates(Array.isArray(list) ? list : []);
    } catch (_) { setCandidates([]); }
    setLoadingCandidates(false);
  };

  useEffect(() => { loadCandidates(); }, [job?.id]);

  const updateJob = async (data) => {
    const res = await base44.entities.HireJob.update(job.id, data);
    const updated = res?.data ?? res;
    onJobUpdated(updated);
  };

  const handleCandidateCreated = (candidate) => {
    setCandidates(prev => [candidate, ...prev]);
    setShowAddCandidate(false);
    setShowImport(false);
  };

  const setStatus = async (status) => { await updateJob({ status }); };

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
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{job?.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED_DARK }}>{job?.department}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={statusStyle(job?.status)}>{job?.status}</span>
            <select className="rounded-lg px-3 py-1.5 text-sm" style={{ borderColor: "rgba(184,149,106,0.2)", backgroundColor: CREAM, color: TEXT_DARK }}
              value={job?.status || "draft"} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </div>
        </div>
        <div className="pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED_DARK }}>Hiring Pipeline Progress</p>
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
                backgroundColor: active ? CREAM : "transparent",
                color: active ? GOLD_DARK : MUTED_LIGHT,
                border: active ? "1px solid rgba(184,149,106,0.12)" : "1px solid transparent",
                boxShadow: active ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
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
            {job?.description && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_DARK }}>Description</p><p className="text-sm whitespace-pre-wrap" style={{ color: TEXT_DARK }}>{job.description}</p></div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {job?.responsibilities?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_DARK }}>Responsibilities</p><ul className="text-sm space-y-0.5" style={{ color: TEXT_DARK }}>{job.responsibilities.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.required_qualifications?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_DARK }}>Required Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: TEXT_DARK }}>{job.required_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.preferred_qualifications?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_DARK }}>Preferred Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: TEXT_DARK }}>{job.preferred_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.skills?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: MUTED_DARK }}>Skills</p><div className="flex flex-wrap gap-1">{job.skills.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: innerBg, color: TEXT_DARK }}>{s}</span>)}</div></div>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
              {job?.experience_requirements && <div><p className="text-xs" style={{ color: MUTED_DARK }}>Experience</p><p style={{ color: TEXT_DARK }}>{job.experience_requirements}</p></div>}
              {job?.compensation && <div><p className="text-xs" style={{ color: MUTED_DARK }}>Compensation</p><p style={{ color: TEXT_DARK }}>{job.compensation}</p></div>}
              {job?.work_schedule && <div><p className="text-xs" style={{ color: MUTED_DARK }}>Schedule</p><p style={{ color: TEXT_DARK }}>{job.work_schedule}</p></div>}
              {job?.performance_expectations && <div><p className="text-xs" style={{ color: MUTED_DARK }}>Performance Expectations</p><p style={{ color: TEXT_DARK }}>{job.performance_expectations}</p></div>}
            </div>
          </div>
        )}

        {tab === "profile" && <RoleProfileCard job={job} onUpdate={updateJob} />}

        {tab === "questionnaire" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold mb-1" style={{ ...SERIF, color: TEXT_DARK }}>Interview Questionnaire</h3>
              <p className="text-sm" style={{ color: MUTED_DARK }}>Upload or paste your interview questionnaire. The AI will parse it into a scorecard template that pre-populates when creating new interviews for candidates.</p>
            </div>
            <QuestionnaireUploader job={job} onUpdate={updateJob} />
          </div>
        )}

        {tab === "candidates" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Candidates</h3>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowImport(true)} style={{ backgroundColor: CREAM, color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.2)" }}><FileText className="w-4 h-4 mr-2" /> Import</Button>
                <Button variant="outline" onClick={onCompare} style={{ backgroundColor: CREAM, color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.2)" }}><GitCompare className="w-4 h-4 mr-2" /> Compare</Button>
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
              <p className="text-sm text-center py-8" style={{ color: MUTED_DARK }}>No candidates yet</p>
            ) : (
              <div className="space-y-2">
                {candidates.map(c => (
                  <div key={c.id} onClick={() => onSelectCandidate(c)}
                    className="p-3 cursor-pointer flex justify-between items-center rounded-lg transition-all hover:translate-x-0.5"
                    style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.1)" }}>
                    <div>
                      <p className="font-medium" style={{ color: TEXT_DARK }}>{c.name}</p>
                      <p className="text-xs" style={{ color: MUTED_DARK }}>{c.email} · {c.status}</p>
                    </div>
                    {c.evaluation?.estimated_success_score != null && (
                      <span className="text-lg font-bold" style={{ color: GOLD_DARK }}>{Math.round(c.evaluation.estimated_success_score)}</span>
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
              <Button variant="outline" onClick={onCompare} style={{ backgroundColor: CREAM, color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.2)" }}><GitCompare className="w-4 h-4 mr-2" /> Compare Candidates</Button>
            </div>
            <RankingTable candidates={candidates} jobId={job.id} onSelectCandidate={onSelectCandidate} />
          </div>
        )}
      </div>
    </div>
  );
}