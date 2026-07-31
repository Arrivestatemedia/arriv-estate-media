import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus, Loader2, Users, Brain } from "lucide-react";
import JobCreateForm from "@/components/hireiq/JobCreateForm";
import JobDetailPanel from "@/components/hireiq/JobDetailPanel";
import CandidateDetailPanel from "@/components/hireiq/CandidateDetailPanel";
import ComparePanel from "@/components/hireiq/ComparePanel";
import LearningPanel from "@/components/hireiq/LearningPanel";

const DARK_BG = "#2a3536";
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

export default function HireIQ() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topTab, setTopTab] = useState("jobs");

  const [view, setView] = useState("dashboard");
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

  const goJobsHome = () => { setView("dashboard"); setSelectedJob(null); setSelectedCandidate(null); };

  const sidebarItems = [
    { id: "jobs", label: "Jobs", icon: Briefcase },
    { id: "learning", label: "Learning", icon: Brain },
  ];

  const pageTitle = topTab === "learning" ? "Learning System" : view === "job" ? (selectedJob?.title || "Job Detail") : view === "candidate" ? (selectedCandidate?.name || "Candidate") : view === "compare" ? "Compare Candidates" : "Jobs";

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)", backgroundColor: DARK_BG }}>
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 sticky top-16" style={{ backgroundColor: CREAM, height: "calc(100vh - 64px)", borderRight: `2px solid ${DARK_BORDER}` }}>
        <div className="p-5 border-b" style={{ borderColor: DARK_BORDER }}>
          <div className="flex items-center gap-2">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv" className="h-6" />
            <span className="text-lg font-bold" style={{ ...SERIF, color: DARK_TEXT }}>HireIQ</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const active = topTab === item.id && (item.id === "learning" || view === "dashboard");
            return (
              <button key={item.id}
                onClick={() => { setTopTab(item.id); if (item.id === "jobs") goJobsHome(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? GOLD : "transparent",
                  color: active ? "#fff" : DARK_TEXT,
                }}>
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: DARK_BORDER }}>
          <p className="text-xs" style={{ color: "#6b7c7a" }}>AI-Powered Hiring</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: DARK_TEXT }}>Arriv HireIQ System</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 p-2 border-b" style={{ backgroundColor: CREAM, borderColor: DARK_BORDER }}>
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const active = topTab === item.id;
            return (
              <button key={item.id}
                onClick={() => { setTopTab(item.id); if (item.id === "jobs") goJobsHome(); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: active ? GOLD : "transparent", color: active ? "#fff" : DARK_TEXT }}>
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "rgba(227,223,217,0.1)" }}>
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: LIGHT_TEXT }}>{pageTitle}</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>
              {topTab === "learning" ? "AI-powered analysis of hiring prediction accuracy" : view === "dashboard" ? "Manage job openings and candidates" : ""}
            </p>
          </div>
          {view === "dashboard" && topTab === "jobs" && !loading && (
            <Button onClick={() => setShowCreate(true)} style={{ backgroundColor: GOLD, color: "#fff", border: `1px solid ${DARK_BORDER}`, boxShadow: `2px 2px 0 ${DARK_BORDER}` }}>
              <Plus className="w-4 h-4 mr-2" /> Create Job Opening
            </Button>
          )}
          {view !== "dashboard" && topTab === "jobs" && (
            <Button variant="outline" onClick={goJobsHome} style={{ backgroundColor: CREAM, color: DARK_TEXT, border: `1px solid ${DARK_BORDER}` }}>
              ← Back to Jobs
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {topTab === "learning" ? (
            <LearningPanel />
          ) : view === "candidate" && selectedCandidate ? (
            <CandidateDetailPanel
              candidate={selectedCandidate}
              job={selectedJob}
              onBack={() => setView("job")}
              onCandidateUpdated={handleCandidateUpdated}
            />
          ) : view === "compare" && selectedJob ? (
            <ComparePanel job={selectedJob} onBack={() => setView("job")} />
          ) : view === "job" && selectedJob ? (
            <JobDetailPanel
              job={selectedJob}
              onBack={goJobsHome}
              onSelectCandidate={handleSelectCandidate}
              onCompare={() => setView("compare")}
              onJobUpdated={handleJobUpdated}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED }} /></div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20" style={{ color: MUTED }}>
              <Briefcase className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-lg" style={{ color: LIGHT_TEXT }}>No job openings yet</p>
              <p className="text-sm mt-1">Create your first job opening to start hiring.</p>
              <Button onClick={() => setShowCreate(true)} className="mt-6" style={{ backgroundColor: GOLD, color: "#fff", border: `1px solid ${DARK_BORDER}`, boxShadow: `2px 2px 0 ${DARK_BORDER}` }}>
                <Plus className="w-4 h-4 mr-2" /> Create Job Opening
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {jobs.map(job => {
                const ss = statusStyle(job.status);
                return (
                  <div key={job.id} onClick={() => handleSelectJob(job)}
                    className="p-5 cursor-pointer transition-transform hover:-translate-y-0.5"
                    style={stackedCard}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg" style={{ ...SERIF, color: DARK_TEXT }}>{job.title || "Untitled"}</h3>
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: ss.bg, color: ss.text }}>{job.status}</span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: "#6b7c7a" }}>{job.department || "No department"}</p>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "#6b7c7a" }}>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Candidates</span>
                      {job.role_profile_approved && <span className="flex items-center gap-1" style={{ color: GOLD }}><Brain className="w-3 h-3" /> Profile Approved</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !creating && setShowCreate(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" style={stackedCard} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4" style={{ ...SERIF, color: DARK_TEXT }}>Create Job Opening</h2>
            {creating ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
                <span className="ml-2" style={{ color: "#6b7c7a" }}>Creating job...</span>
              </div>
            ) : (
              <JobCreateForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}