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

const LIGHT_TEXT = "#e3dfd9";
const MUTED = "#8a9a98";
const GOLD = "#B8956A";
const CREAM = "#f3efe9";
const DARK_BORDER = "#1a2021";
const DARK_TEXT = "#2a3536";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const stackedCard = {
  backgroundColor: CREAM,
  border: `2px solid ${DARK_BORDER}`,
  borderRadius: "10px",
  boxShadow: `3px 3px 0 ${DARK_BORDER}, 6px 8px 20px rgba(0,0,0,0.35)`,
};

const statusStyle = (s) => ({
  draft: { bg: "#e5e7eb", text: "#4b5563" },
  open: { bg: "#d1fae5", text: "#065f46" },
  closed: { bg: "#fee2e2", text: "#991b1b" },
  filled: { bg: "#dbeafe", text: "#1e40af" },
}[s] || { bg: "#e5e7eb", text: "#4b5563" });

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
      <div className="p-5 mb-5" style={stackedCard}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: DARK_TEXT }}>{job?.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: "#6b7c7a" }}>{job?.department}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={statusStyle(job?.status)}>{job?.status}</span>
            <select className="border rounded px-3 py-1.5 text-sm" style={{ borderColor: DARK_BORDER, backgroundColor: CREAM, color: DARK_TEXT }}
              value={job?.status || "draft"} onChange={e => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="filled">Filled</option>
            </select>
          </div>
        </div>
        {/* Workflow stepper */}
        <div className="pt-3 border-t" style={{ borderColor: "rgba(26,32,33,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#6b7c7a" }}>Hiring Pipeline Progress</p>
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
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-all"
              style={{
                backgroundColor: active ? CREAM : "transparent",
                color: active ? GOLD : MUTED,
                border: active ? `2px solid ${DARK_BORDER}` : "2px solid transparent",
                borderBottom: active ? "2px solid " + CREAM : "2px solid transparent",
              }}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="p-5" style={stackedCard}>
        {tab === "overview" && (
          <div className="space-y-4">
            {job?.description && <div><p className="text-sm font-semibold mb-1" style={{ color: "#6b7c7a" }}>Description</p><p className="text-sm whitespace-pre-wrap" style={{ color: DARK_TEXT }}>{job.description}</p></div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {job?.responsibilities?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: "#6b7c7a" }}>Responsibilities</p><ul className="text-sm space-y-0.5" style={{ color: DARK_TEXT }}>{job.responsibilities.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.required_qualifications?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: "#6b7c7a" }}>Required Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: DARK_TEXT }}>{job.required_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.preferred_qualifications?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: "#6b7c7a" }}>Preferred Qualifications</p><ul className="text-sm space-y-0.5" style={{ color: DARK_TEXT }}>{job.preferred_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
              {job?.skills?.length > 0 && <div><p className="text-sm font-semibold mb-1" style={{ color: "#6b7c7a" }}>Skills</p><div className="flex flex-wrap gap-1">{job.skills.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#e5e7eb", color: DARK_TEXT }}>{s}</span>)}</div></div>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm pt-3 border-t" style={{ borderColor: "rgba(26,32,33,0.1)" }}>
              {job?.experience_requirements && <div><p className="text-xs" style={{ color: "#6b7c7a" }}>Experience</p><p style={{ color: DARK_TEXT }}>{job.experience_requirements}</p></div>}
              {job?.compensation && <div><p className="text-xs" style={{ color: "#6b7c7a" }}>Compensation</p><p style={{ color: DARK_TEXT }}>{job.compensation}</p></div>}
              {job?.work_schedule && <div><p className="text-xs" style={{ color: "#6b7c7a" }}>Schedule</p><p style={{ color: DARK_TEXT }}>{job.work_schedule}</p></div>}
              {job?.performance_expectations && <div><p className="text-xs" style={{ color: "#6b7c7a" }}>Performance Expectations</p><p style={{ color: DARK_TEXT }}>{job.performance_expectations}</p></div>}
            </div>
          </div>
        )}

        {tab === "profile" && <RoleProfileCard job={job} onUpdate={updateJob} />}

        {tab === "questionnaire" && (
          <div className="space-y-4">
            <div>
              <h3 className="font-bold mb-1" style={{ ...SERIF, color: DARK_TEXT }}>Interview Questionnaire</h3>
              <p className="text-sm" style={{ color: "#6b7c7a" }}>Upload or paste your interview questionnaire. The AI will parse it into a scorecard template that pre-populates when creating new interviews for candidates.</p>
            </div>
            <QuestionnaireUploader job={job} onUpdate={updateJob} />
          </div>
        )}

        {tab === "candidates" && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-bold" style={{ ...SERIF, color: DARK_TEXT }}>Candidates</h3>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowImport(true)} style={{ backgroundColor: CREAM, color: DARK_TEXT, border: `1px solid ${DARK_BORDER}` }}><FileText className="w-4 h-4 mr-2" /> Import</Button>
                <Button variant="outline" onClick={onCompare} style={{ backgroundColor: CREAM, color: DARK_TEXT, border: `1px solid ${DARK_BORDER}` }}><GitCompare className="w-4 h-4 mr-2" /> Compare</Button>
                <Button onClick={() => setShowAddCandidate(true)} style={{ backgroundColor: GOLD, color: "#fff", border: `1px solid ${DARK_BORDER}` }}><Plus className="w-4 h-4 mr-2" /> Add Candidate</Button>
              </div>
            </div>
            {showAddCandidate && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: "#ede8e0", border: `1px solid ${DARK_BORDER}` }}>
                <CandidateForm jobId={job.id} jobData={job} roleProfile={roleProfile} onCreated={handleCandidateCreated} onCancel={() => setShowAddCandidate(false)} />
              </div>
            )}
            {showImport && (
              <div className="p-4 rounded-lg" style={{ backgroundColor: "#ede8e0", border: `1px solid ${DARK_BORDER}` }}>
                <ImportApplicationsModal jobId={job.id} jobData={job} roleProfile={roleProfile} onImported={handleCandidateCreated} onCancel={() => setShowImport(false)} />
              </div>
            )}
            {loadingCandidates ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} /></div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#6b7c7a" }}>No candidates yet</p>
            ) : (
              <div className="space-y-2">
                {candidates.map(c => (
                  <div key={c.id} onClick={() => onSelectCandidate(c)}
                    className="p-3 cursor-pointer flex justify-between items-center rounded-lg transition-all hover:translate-x-0.5"
                    style={{ backgroundColor: "#ede8e0", border: `1px solid ${DARK_BORDER}` }}>
                    <div>
                      <p className="font-medium" style={{ color: DARK_TEXT }}>{c.name}</p>
                      <p className="text-xs" style={{ color: "#6b7c7a" }}>{c.email} · {c.status}</p>
                    </div>
                    {c.evaluation?.estimated_success_score != null && (
                      <span className="text-lg font-bold" style={{ color: GOLD }}>{Math.round(c.evaluation.estimated_success_score)}</span>
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
              <Button variant="outline" onClick={onCompare} style={{ backgroundColor: CREAM, color: DARK_TEXT, border: `1px solid ${DARK_BORDER}` }}><GitCompare className="w-4 h-4 mr-2" /> Compare Candidates</Button>
            </div>
            <RankingTable candidates={candidates} jobId={job.id} onSelectCandidate={onSelectCandidate} />
          </div>
        )}
      </div>
    </div>
  );
}