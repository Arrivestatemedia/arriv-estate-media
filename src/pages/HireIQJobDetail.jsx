import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Plus, Users, GitCompare, Briefcase, FileText } from "lucide-react";
import RoleProfileCard from "@/components/hireiq/RoleProfileCard";
import CandidateForm from "@/components/hireiq/CandidateForm";
import RankingTable from "@/components/hireiq/RankingTable";
import ImportApplicationsModal from "@/components/hireiq/ImportApplicationsModal";
import QuestionnaireUploader from "@/components/hireiq/QuestionnaireUploader";

export default function HireIQJobDetail() {
  const [job, setJob] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState("overview");
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([
      base44.entities.HireJob.list("-created_date", 200).then(list => (list || []).find(j => j.id === id)).catch(() => null),
      base44.entities.HireCandidate.filter({ job_id: id }, "-created_date", 100).catch(() => []),
    ])
    .then(([j, cands]) => {
      setJob(j);
      setCandidates(cands || []);
    })
    .finally(() => setLoading(false));
  }, [id]);

  const updateJob = async (data) => {
    const updated = await base44.entities.HireJob.update(id, data);
    setJob(updated);
  };

  const handleCandidateCreated = (candidate) => {
    setCandidates(prev => [candidate, ...prev]);
    setShowAddCandidate(false);
  };

  const setStatus = async (status) => {
    await updateJob({ status });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  if (!job) return <div className="text-center py-20 text-gray-500">Job not found</div>;

  const roleProfile = job.role_success_profile;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button onClick={() => navigate(createPageUrl("HireIQ"))} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to HireIQ
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <p className="text-sm text-gray-500">{job.department} · {job.status}</p>
        </div>
        <div className="flex gap-2">
          <select className="border rounded px-3 py-1.5 text-sm" value={job.status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="filled">Filled</option>
          </select>
        </div>
      </div>

      <div className="flex gap-1 border-b mb-4">
        {[
          { id: "overview", label: "Overview", icon: Briefcase },
          { id: "profile", label: "Role Success Profile", icon: Users },
          { id: "questionnaire", label: "Questionnaire", icon: FileText },
          { id: "candidates", label: `Candidates (${candidates.length})`, icon: Users },
          { id: "ranking", label: "Ranking", icon: Users },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? "border-[#B8956A] text-[#B8956A]" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {job.description && <div><p className="text-sm font-semibold text-gray-500 mb-1">Description</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p></div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {job.responsibilities?.length > 0 && <div><p className="text-sm font-semibold text-gray-500 mb-1">Responsibilities</p><ul className="text-sm space-y-0.5">{job.responsibilities.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
            {job.required_qualifications?.length > 0 && <div><p className="text-sm font-semibold text-gray-500 mb-1">Required Qualifications</p><ul className="text-sm space-y-0.5">{job.required_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
            {job.preferred_qualifications?.length > 0 && <div><p className="text-sm font-semibold text-gray-500 mb-1">Preferred Qualifications</p><ul className="text-sm space-y-0.5">{job.preferred_qualifications.map((r, i) => <li key={i}>• {r}</li>)}</ul></div>}
            {job.skills?.length > 0 && <div><p className="text-sm font-semibold text-gray-500 mb-1">Skills</p><div className="flex flex-wrap gap-1">{job.skills.map((s, i) => <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{s}</span>)}</div></div>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {job.experience_requirements && <div><p className="text-xs text-gray-400">Experience</p><p>{job.experience_requirements}</p></div>}
            {job.compensation && <div><p className="text-xs text-gray-400">Compensation</p><p>{job.compensation}</p></div>}
            {job.work_schedule && <div><p className="text-xs text-gray-400">Schedule</p><p>{job.work_schedule}</p></div>}
            {job.performance_expectations && <div><p className="text-xs text-gray-400">Performance Expectations</p><p>{job.performance_expectations}</p></div>}
          </div>
        </div>
      )}

      {tab === "profile" && <RoleProfileCard job={job} onUpdate={updateJob} />}

      {tab === "questionnaire" && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Interview Questionnaire</h3>
            <p className="text-sm text-gray-500 mb-4">Upload or paste your interview questionnaire. The AI will parse it into a scorecard template that pre-populates when creating new interviews for candidates.</p>
          </div>
          <QuestionnaireUploader job={job} onUpdate={updateJob} />
        </div>
      )}

      {tab === "candidates" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Candidates</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowImport(true)}><FileText className="w-4 h-4 mr-2" /> Import from Applications</Button>
              <Button variant="outline" onClick={() => navigate(createPageUrl("HireIQCompare") + `?jobId=${id}`)}><GitCompare className="w-4 h-4 mr-2" /> Compare</Button>
              <Button onClick={() => setShowAddCandidate(true)} style={{ backgroundColor: "#B8956A" }}><Plus className="w-4 h-4 mr-2" /> Add Candidate</Button>
            </div>
          </div>
          {showAddCandidate && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <CandidateForm jobId={id} jobData={job} roleProfile={roleProfile} onCreated={handleCandidateCreated} onCancel={() => setShowAddCandidate(false)} />
            </div>
          )}
          {showImport && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <ImportApplicationsModal jobId={id} jobData={job} roleProfile={roleProfile} onImported={handleCandidateCreated} onCancel={() => setShowImport(false)} />
            </div>
          )}
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No candidates yet</p>
          ) : (
            <div className="space-y-2">
              {candidates.map(c => (
                <div key={c.id} onClick={() => navigate(createPageUrl("HireIQCandidateDetail") + `?id=${c.id}`)}
                  className="border rounded-lg p-3 cursor-pointer hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.email} · {c.status}</p>
                  </div>
                  {c.evaluation?.estimated_success_score != null && (
                    <span className="text-sm font-bold text-[#B8956A]">{Math.round(c.evaluation.estimated_success_score)}</span>
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
            <Button variant="outline" onClick={() => navigate(createPageUrl("HireIQCompare") + `?jobId=${id}`)}><GitCompare className="w-4 h-4 mr-2" /> Compare Candidates</Button>
          </div>
          <RankingTable candidates={candidates} jobId={id} />
        </div>
      )}
    </div>
  );
}