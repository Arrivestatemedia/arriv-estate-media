import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus, Loader2, Users, Brain } from "lucide-react";
import JobCreateForm from "@/components/hireiq/JobCreateForm";
import JobDetailPanel from "@/components/hireiq/JobDetailPanel";
import CandidateDetailPanel from "@/components/hireiq/CandidateDetailPanel";
import ComparePanel from "@/components/hireiq/ComparePanel";
import LearningPanel from "@/components/hireiq/LearningPanel";

export default function HireIQ() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topTab, setTopTab] = useState("jobs");

  // View state — replaces URL navigation
  const [view, setView] = useState("dashboard"); // dashboard | job | candidate | compare
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const loadJobs = async () => {
    try {
      const res = await base44.entities.HireJob.list("-created_date", 50);
      const list = res?.data ?? res;
      setJobs(Array.isArray(list) ? list : []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, []);

  const handleCreate = async (jobData) => {
    setCreating(true);
    try {
      const res = await base44.entities.HireJob.create({
        ...jobData,
        status: "draft",
        role_profile_approved: false,
        created_by_name: localStorage.getItem("sales_member_name") || localStorage.getItem("user_name") || "Admin",
      });
      const job = res?.data ?? res;
      setJobs(prev => [job, ...prev]);
      setShowCreate(false);
      setSelectedJob(job);
      setView("job");
    } catch (err) {
      alert("Failed to create job: " + (err.message || "unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    setSelectedCandidate(null);
    setView("job");
  };

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setView("candidate");
  };

  const handleJobUpdated = (updatedJob) => {
    setSelectedJob(updatedJob);
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
  };

  const handleCandidateUpdated = (updatedCandidate) => {
    setSelectedCandidate(updatedCandidate);
  };

  const statusColor = (s) => ({
    draft: "bg-gray-100 text-gray-600",
    open: "bg-green-100 text-green-700",
    closed: "bg-red-100 text-red-600",
    filled: "bg-blue-100 text-blue-700",
  }[s] || "bg-gray-100 text-gray-600");

  // Learning tab
  if (topTab === "learning") {
    return (
      <div>
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <TopTabs topTab={topTab} setTopTab={setTopTab} />
        </div>
        <LearningPanel />
      </div>
    );
  }

  // Candidate detail view
  if (view === "candidate" && selectedCandidate) {
    return (
      <div>
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <TopTabs topTab={topTab} setTopTab={setTopTab} onJobsTab={() => { setView("dashboard"); setSelectedJob(null); setSelectedCandidate(null); }} />
        </div>
        <CandidateDetailPanel
          candidate={selectedCandidate}
          job={selectedJob}
          onBack={() => setView("job")}
          onCandidateUpdated={handleCandidateUpdated}
        />
      </div>
    );
  }

  // Compare view
  if (view === "compare" && selectedJob) {
    return (
      <div>
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <TopTabs topTab={topTab} setTopTab={setTopTab} onJobsTab={() => { setView("dashboard"); setSelectedJob(null); }} />
        </div>
        <ComparePanel job={selectedJob} onBack={() => setView("job")} />
      </div>
    );
  }

  // Job detail view
  if (view === "job" && selectedJob) {
    return (
      <div>
        <div className="max-w-6xl mx-auto px-4 pt-4">
          <TopTabs topTab={topTab} setTopTab={setTopTab} onJobsTab={() => { setView("dashboard"); setSelectedJob(null); }} />
        </div>
        <JobDetailPanel
          job={selectedJob}
          onBack={() => { setView("dashboard"); setSelectedJob(null); }}
          onSelectCandidate={handleSelectCandidate}
          onCompare={() => setView("compare")}
          onJobUpdated={handleJobUpdated}
        />
      </div>
    );
  }

  // Dashboard view (job list)
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#B8956A] flex items-center justify-center">
          <Briefcase className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Arriv HireIQ</h1>
          <p className="text-sm text-gray-500">AI-powered hiring & interview management</p>
        </div>
      </div>

      <TopTabs topTab={topTab} setTopTab={setTopTab} />

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">Create Job Opening</h2>
            {creating ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
                <span className="ml-2 text-gray-500">Creating job...</span>
              </div>
            ) : (
              <JobCreateForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20">
          <Briefcase className="w-16 h-16 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No job openings yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first job opening to start hiring.</p>
          <Button onClick={() => setShowCreate(true)} className="mt-6 bg-[#1a1a1a] hover:bg-[#1a1a1a]/90 text-white">
            <Plus className="w-4 h-4 mr-2" /> Create Job Opening
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowCreate(true)} style={{ backgroundColor: "#B8956A" }}>
              <Plus className="w-4 h-4 mr-2" /> Create Job Opening
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map(job => (
              <div key={job.id} onClick={() => handleSelectJob(job)}
                className="bg-white rounded-xl border shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                style={{ borderColor: "rgba(184,149,106,0.2)" }}>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-800">{job.title || "Untitled"}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColor(job.status)}`}>{job.status}</span>
                </div>
                <p className="text-sm text-gray-500">{job.department || "No department"}</p>
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Candidates: —</span>
                  {job.role_profile_approved && <span className="text-green-500">Profile approved</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopTabs({ topTab, setTopTab, onJobsTab }) {
  return (
    <div className="flex gap-1 border-b mb-4">
      <button
        onClick={() => { setTopTab("jobs"); onJobsTab?.(); }}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          topTab === "jobs" ? "border-[#B8956A] text-[#B8956A]" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}>
        <Briefcase className="w-4 h-4" /> Jobs
      </button>
      <button
        onClick={() => setTopTab("learning")}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          topTab === "learning" ? "border-[#B8956A] text-[#B8956A]" : "border-transparent text-gray-500 hover:text-gray-700"
        }`}>
        <Brain className="w-4 h-4" /> Learning
      </button>
    </div>
  );
}