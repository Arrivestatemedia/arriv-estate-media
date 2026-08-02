import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Briefcase, Plus, Loader2, Users, Brain, FileText, Search, BarChart3 } from "lucide-react";
import JobCreateForm from "@/components/hireiq/JobCreateForm";
import JobDetailPanel from "@/components/hireiq/JobDetailPanel";
import CandidateDetailPanel from "@/components/hireiq/CandidateDetailPanel";
import ComparePanel from "@/components/hireiq/ComparePanel";
import LearningPanel from "@/components/hireiq/LearningPanel";
import { syncApplicationsToYouHireIQ } from "@/lib/hireiq";
import ApplicationsPanel from "@/components/hireiq/ApplicationsPanel";
import ApplicantPortalPanel from "@/components/hireiq/ApplicantPortalPanel";
import AnalyticsPanel from "@/components/hireiq/analytics/AnalyticsPanel";
import RecruitingPanel from "@/components/recruiting/RecruitingPanel";
import { Radar } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const statusStyle = (s) => ({
  draft: { bg: "rgba(255,251,245,0.08)", text: "rgba(255,251,245,0.6)" },
  open: { bg: "#B8956A", text: "#1A1A1A" },
  closed: { bg: "rgba(220,38,38,0.2)", text: "#FCA5A5" },
  filled: { bg: "#A68559", text: "#FFFBF5" },
}[s] || { bg: "rgba(255,251,245,0.08)", text: "rgba(255,251,245,0.6)" });

export default function YouHireIQ() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topTab, setTopTab] = useState("jobs");

  const [view, setView] = useState("dashboard");
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const loadJobs = async () => {
    setSyncing(true);
    try {
      await syncApplicationsToYouHireIQ();
    } catch (_) {}
    setSyncing(false);
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

  const handleDeleteJob = async (job) => {
    try {
      await base44.entities.HireCandidate.deleteMany({ job_id: job.id });
    } catch (_) {}
    await base44.entities.HireJob.delete(job.id);
    setJobs(prev => prev.filter(j => j.id !== job.id));
    goJobsHome();
  };

  const sidebarItems = [
    { id: "jobs", label: "Jobs", icon: Briefcase },
    { id: "applications", label: "Applications", icon: FileText },
    { id: "portal", label: "Applicant Portal", icon: Search },
    { id: "learning", label: "Learning", icon: Brain },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "recruiting", label: "Recruiting", icon: Radar },
  ];

  const pageTitle = topTab === "applications" ? "Job Applications" : topTab === "portal" ? "Applicant Portal" : topTab === "analytics" ? "Analytics" : topTab === "learning" ? "Learning System" : topTab === "recruiting" ? "AI Recruiting" : view === "job" ? (selectedJob?.title || "Job Detail") : view === "candidate" ? (selectedCandidate?.name || "Candidate") : view === "compare" ? "Compare Candidates" : "Jobs";

  return (
    <div className="flex" style={{ minHeight: "calc(100vh - 64px)", background: "radial-gradient(circle at 30% 0%, #FFFBF5 0%, #F5F2EC 60%, #FFFBF5 100%)" }}>
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 sticky top-16" style={{ backgroundColor: "#0A0A0A", height: "calc(100vh - 64px)", borderRight: "1px solid rgba(184,149,106,0.15)" }}>
        <div className="p-5" style={{ borderBottom: "1px solid rgba(184,149,106,0.1)" }}>
          <div className="flex items-center gap-2">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv" className="h-6" />
            <span className="text-lg font-bold" style={{ ...SERIF, color: CREAM }}>YouHireIQ</span>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const active = topTab === item.id && (item.id === "learning" || item.id === "applications" || item.id === "portal" || item.id === "analytics" || item.id === "recruiting" || view === "dashboard");
            return (
              <button key={item.id}
                onClick={() => { setTopTab(item.id); if (item.id === "jobs") goJobsHome(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? GOLD : "transparent",
                  color: active ? "#0A0A0A" : MUTED_LIGHT,
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = CREAM; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = MUTED_LIGHT; }}>
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
          <p className="text-xs" style={{ color: MUTED_LIGHT }}>AI-Powered Hiring</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: CREAM }}>Arriv YouHireIQ</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 p-2" style={{ backgroundColor: "#0A0A0A", borderBottom: "1px solid rgba(184,149,106,0.1)" }}>
          {sidebarItems.map(item => {
            const Icon = item.icon;
            const active = topTab === item.id;
            return (
              <button key={item.id}
                onClick={() => { setTopTab(item.id); if (item.id === "jobs") goJobsHome(); }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: active ? GOLD : "transparent", color: active ? "#0A0A0A" : CREAM }}>
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{pageTitle}</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED_DARK }}>
              {topTab === "applications" ? "Review and manage applicant submissions" : topTab === "portal" ? "Look up an applicant's application status and documents" : topTab === "analytics" ? "Hiring effectiveness and AI prediction accuracy" : topTab === "learning" ? "AI-powered analysis of hiring prediction accuracy" : topTab === "recruiting" ? "AI-powered talent sourcing and outreach" : view === "dashboard" ? "Manage job openings and candidates" : ""}
            </p>
          </div>
          {view === "dashboard" && topTab === "jobs" && !loading && (
            <Button onClick={() => setShowCreate(true)} style={{ backgroundColor: "#0A0A0A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}>
              <Plus className="w-4 h-4 mr-2" /> Create Job Opening
            </Button>
          )}
          {view !== "dashboard" && topTab === "jobs" && (
            <Button variant="outline" onClick={goJobsHome} style={{ backgroundColor: "transparent", color: TEXT_DARK, border: "1px solid rgba(26,26,26,0.15)" }}>
              ← Back to Jobs
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {topTab === "applications" ? (
            <ApplicationsPanel />
          ) : topTab === "portal" ? (
            <div className="max-w-2xl mx-auto">
              <ApplicantPortalPanel />
            </div>
          ) : topTab === "analytics" ? (
            <AnalyticsPanel />
          ) : topTab === "learning" ? (
            <LearningPanel />
          ) : topTab === "recruiting" ? (
            <RecruitingPanel />
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
              onDelete={handleDeleteJob}
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              {syncing ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
                  <span className="ml-3 text-sm" style={{ color: MUTED_DARK }}>Syncing jobs and candidates from applications...</span>
                </>
              ) : (
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED_DARK }} />
              )}
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20">
              <Briefcase className="w-16 h-16 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
              <p className="font-medium text-lg" style={{ color: TEXT_DARK }}>No job openings yet</p>
              <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Create your first job opening to start hiring.</p>
              <Button onClick={() => setShowCreate(true)} className="mt-6" style={{ backgroundColor: "#0A0A0A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}>
                <Plus className="w-4 h-4 mr-2" /> Create Job Opening
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {jobs.map(job => {
                const ss = statusStyle(job.status);
                return (
                  <div key={job.id} onClick={() => handleSelectJob(job)}
                    className="p-5 cursor-pointer transition-all hover:-translate-y-1"
                    style={card}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 12px 40px rgba(184,149,106,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.12)"}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg" style={{ ...SERIF, color: CREAM }}>{job.title || "Untitled"}</h3>
                      <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: ss.bg, color: ss.text }}>{job.status}</span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: MUTED_LIGHT }}>{job.department || "No department"}</p>
                    <div className="flex items-center gap-3 text-xs" style={{ color: MUTED_LIGHT }}>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ backdropFilter: "blur(6px)" }} onClick={() => !creating && setShowCreate(false)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" style={card} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4" style={{ ...SERIF, color: CREAM }}>Create Job Opening</h2>
            {creating ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
                <span className="ml-2" style={{ color: MUTED_LIGHT }}>Creating job...</span>
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