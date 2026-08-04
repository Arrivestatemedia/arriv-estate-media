import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Briefcase, Plus, Loader2, Users, Brain, FileText, Search,
  BarChart3, Sparkles, Radar, Users2, Target, TrendingUp,
  MessageSquare, Award, HelpCircle, LayoutDashboard,
  GitBranch, Video, Globe, SquareCheckBig,
} from "lucide-react";
import JobCreateForm from "@/components/hireiq/JobCreateForm";
import JobDetailPanel from "@/components/hireiq/JobDetailPanel";
import CandidateDetailPanel from "@/components/hireiq/CandidateDetailPanel";
import ComparePanel from "@/components/hireiq/ComparePanel";
import LearningPanel from "@/components/hireiq/LearningPanel";
import { syncApplicationsToKhethaIQ } from "@/lib/hireiq";
import ApplicationsPanel from "@/components/hireiq/ApplicationsPanel";
import ApplicantPortalPanel from "@/components/hireiq/ApplicantPortalPanel";
import AnalyticsPanel from "@/components/hireiq/analytics/AnalyticsPanel";
import RecruitingPanel from "@/components/recruiting/RecruitingPanel";
import RecruitingAssistantHome from "@/components/recruiting/RecruitingAssistantHome";
import TalentPipelinesView from "@/components/recruiting/TalentPipelinesView";
import PipelineMapView from "@/components/recruiting/PipelineMapView";
import RecruitingTasksView from "@/components/recruiting/RecruitingTasksView";
import AskKhethaChat from "@/components/khethaiq/AskKhethaChat";
import RecruitingChat from "@/components/recruiting/RecruitingChat";
import GlobalSearch from "@/components/khethaiq/GlobalSearch";
import { CandidatesView, InterviewsView, OffersView } from "@/components/khethaiq/KhethaIQViews";

// Map manifest icon names to lucide-react components.
// Matches the central KhethaIQ app's ICON_MAP.
const ICON_MAP = {
  LayoutDashboard, Sparkles, Briefcase, Users, Search, GitBranch,
  Video, FileText, SquareCheckBig, Brain, BarChart3: BarChart3,
  Radar, Users2, Target, TrendingUp, MessageSquare, Award,
  HelpCircle, Plus, Globe,
};

// Estate Media color palette (kept per user request)
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

const statusStyle = (s) => ({
  draft: { bg: "rgba(255,251,245,0.08)", text: "rgba(255,251,245,0.6)" },
  open: { bg: "#B8956A", text: "#1A1A1A" },
  closed: { bg: "rgba(220,38,38,0.2)", text: "#FCA5A5" },
  filled: { bg: "#A68559", text: "#FFFBF5" },
}[s] || { bg: "rgba(255,251,245,0.08)", text: "rgba(255,251,245,0.6)" });

export default function KhethaIQ() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");

  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCandidates, setCompareCandidates] = useState([]);
  const [initialTab, setInitialTab] = useState(null);
  const [preselectedCandidateId, setPreselectedCandidateId] = useState(null);

  const loadJobs = async () => {
    setSyncing(true);
    try {
      await syncApplicationsToKhethaIQ();
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

  // Manifest-driven layout: fetches the UI config (tabs, logo, title) from the
  // central KhethaIQ app via getKhethaIQManifest. Estate Media renders local
  // components but adopts the main app's tab structure, labels, logo, and
  // title — keeping Estate Media's color palette.
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    base44.functions.invoke("getKhethaIQManifest", {})
      .then(res => setManifest(res?.data ?? res))
      .catch(() => setManifest(null));
  }, []);

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
    } catch (err) {
      alert("Failed to create job: " + (err.message || "unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const handleSelectJob = (job) => {
    setSelectedJob(job);
    setSelectedCandidate(null);
    setInitialTab(null);
    setPreselectedCandidateId(null);
  };

  const handleSelectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
  };

  const handleJobUpdated = (updatedJob) => {
    setSelectedJob(updatedJob);
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
  };

  const goJobsHome = () => { setSelectedJob(null); setSelectedCandidate(null); setInitialTab(null); setPreselectedCandidateId(null); };

  const handleOpenQuestionnaire = async (conference) => {
    try {
      const participant = conference?.participants?.[0];
      if (!participant?.id) return;
      const app = await base44.entities.JobApplication.get(participant.id);
      let jobId = app?.job_id;

      // Fallback: find a job matching the application's position
      if (!jobId && app?.position) {
        const matchJob = jobs.find(j => j.source_application_position === app.position);
        if (matchJob) jobId = matchJob.id;
      }
      // Fallback: any job
      if (!jobId && jobs.length > 0) jobId = jobs[0].id;

      if (jobId) {
        let job = jobs.find(j => j.id === jobId);
        if (!job) {
          const res = await base44.entities.HireJob.get(jobId);
          job = res?.data ?? res;
        }
        if (job) {
          // Find the HireCandidate matching this applicant
          let candidateId = app?.hire_candidate_id || null;
          if (!candidateId) {
            try {
              const candRes = await base44.entities.HireCandidate.filter({ job_id: jobId });
              const cands = candRes?.data ?? candRes ?? [];
              const match = cands.find(c =>
                (c.email && app?.email && c.email.toLowerCase() === app.email.toLowerCase()) ||
                (c.name && app?.full_name && c.name.toLowerCase() === app.full_name.toLowerCase())
              );
              if (match) candidateId = match.id;
            } catch (_) {}
          }
          setSelectedJob(job);
          setInitialTab("questionnaire");
          setPreselectedCandidateId(candidateId);
        }
      }
    } catch (_) {}
  };

  const handleDeleteJob = async (job) => {
    try {
      await base44.entities.HireCandidate.deleteMany({ job_id: job.id });
    } catch (_) {}
    await base44.entities.HireJob.delete(job.id);
    setJobs(prev => prev.filter(j => j.id !== job.id));
    goJobsHome();
  };

  // Build sidebar items from the manifest, mapping icon names to components.
  const manifestTabs = manifest?.tabs?.length ? manifest.tabs : [
    { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { id: "ask_khetha", label: "Ask Khetha", icon: "Sparkles" },
    { id: "jobs", label: "Jobs", icon: "Briefcase" },
    { id: "candidates", label: "Candidates", icon: "Users" },
    { id: "talent_search", label: "Talent Search", icon: "Search" },
    { id: "talent_pools", label: "Talent Pools", icon: "Users" },
    { id: "pipeline", label: "Pipeline", icon: "GitBranch" },
    { id: "interviews", label: "Interviews", icon: "Video" },
    { id: "offers", label: "Offers", icon: "FileText" },
    { id: "tasks", label: "Tasks", icon: "SquareCheckBig" },
    { id: "applications", label: "Applications", icon: "FileText" },
    { id: "portal", label: "Applicant Portal", icon: "Search" },
    { id: "learning", label: "Learning", icon: "Brain" },
    { id: "analytics", label: "Analytics", icon: "BarChart3" },
  ];

  // Map manifest tab ids to the central app's view ids
  const viewMap = {
    dashboard: "dashboard",
    ask_khetha: "ask",
    jobs: "jobs",
    candidates: "candidates",
    talent_search: "search",
    talent_pools: "pools",
    pipeline: "pipeline",
    interviews: "interviews",
    offers: "offers",
    tasks: "tasks",
    applications: "applications",
    portal: "portal",
    learning: "learning",
    analytics: "analytics",
  };

  const sidebarItems = manifestTabs
    .map(t => ({ id: t.id, view: t.view || viewMap[t.id] || t.id, label: t.label, icon: ICON_MAP[t.icon] || Briefcase }))
    .filter(t => t.id);

  const manifestLogo = manifest?.logo_url || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar — GlobalSearch + Request New Hire, matching central app */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <GlobalSearch />
        <Button
          onClick={() => setShowCreate(true)}
          className="gap-1.5"
          style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
        >
          <Sparkles className="w-4 h-4" />
          Request New Hire
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar — rounded card matching central app layout */}
        <aside className="md:w-60 shrink-0">
          <div
            className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 md:sticky md:top-24 md:h-[calc(100vh-7rem)] rounded-2xl p-3"
            style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)" }}
          >
            {/* Logo — centered at top, matching central app */}
            <div className="flex justify-center px-2 py-3 mb-2 shrink-0" style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}>
              <img src={manifestLogo} alt="Khetha IQ by Arriv" className="h-24 w-auto object-contain" />
            </div>
            {/* Nav items */}
            <nav className="flex md:flex-col gap-1">
              {sidebarItems.map(item => {
                const Icon = item.icon;
                const active = activeView === item.view;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setSelectedJob(null); setSelectedCandidate(null); setCompareMode(false); setInitialTab(null); setActiveView(item.view); }}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
                    style={{
                      backgroundColor: active ? GOLD : "transparent",
                      color: active ? "#1A1A1A" : MUTED_DARK,
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.1)"; e.currentTarget.style.color = TEXT_DARK; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = MUTED_DARK; } }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {selectedCandidate ? (
            <CandidateDetailPanel
              candidate={selectedCandidate}
              job={selectedJob || jobs.find(j => j.id === selectedCandidate.job_id)}
              onBack={() => { setSelectedCandidate(null); setInitialTab(null); setPreselectedCandidateId(null); }}
              onCandidateUpdated={setSelectedCandidate}
            />
          ) : compareMode && compareCandidates.length >= 2 ? (
            <ComparePanel candidates={compareCandidates} jobs={jobs} onBack={() => setCompareMode(false)} />
          ) : selectedJob ? (
            <JobDetailPanel
              job={selectedJob}
              onBack={goJobsHome}
              onSelectCandidate={handleSelectCandidate}
              onCompare={() => setCompareMode(true)}
              onJobUpdated={handleJobUpdated}
              onDelete={handleDeleteJob}
              initialTab={initialTab}
              preselectedCandidateId={preselectedCandidateId}
            />
          ) : activeView === "dashboard" ? (
            <RecruitingAssistantHome onStartSearch={() => setActiveView("search")} />
          ) : activeView === "ask" ? (
            <AskKhethaChat />
          ) : activeView === "search" ? (
            <RecruitingChat onReviewProspects={() => setActiveView("candidates")} />
          ) : activeView === "pools" ? (
            <TalentPipelinesView />
          ) : activeView === "pipeline" ? (
            <PipelineMapView />
          ) : activeView === "tasks" ? (
            <RecruitingTasksView />
          ) : activeView === "candidates" ? (
            <CandidatesView onSelectCandidate={handleSelectCandidate} />
          ) : activeView === "interviews" ? (
            <InterviewsView onSelectCandidate={handleSelectCandidate} onOpenQuestionnaire={handleOpenQuestionnaire} />
          ) : activeView === "offers" ? (
            <OffersView onSelectCandidate={handleSelectCandidate} />
          ) : activeView === "applications" ? (
            <ApplicationsPanel />
          ) : activeView === "portal" ? (
            <div className="max-w-2xl mx-auto">
              <ApplicantPortalPanel />
            </div>
          ) : activeView === "analytics" ? (
            <AnalyticsPanel />
          ) : activeView === "learning" ? (
            <LearningPanel />
          ) : activeView === "jobs" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Jobs</h1>
                  <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Manage job openings and candidates</p>
                </div>
                <Button
                  onClick={() => setShowCreate(true)}
                  style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Create Job Opening
                </Button>
              </div>
              {syncing && (
                <div className="flex items-center gap-2 text-sm rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.08)", color: MUTED_DARK }}>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: GOLD }} />
                  Syncing applications to Khetha IQ...
                </div>
              )}
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-16">
                  <Briefcase className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
                  <p className="font-medium" style={{ color: TEXT_DARK }}>No job openings yet</p>
                  <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Create your first job opening to start hiring.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.map(job => {
                    const ss = statusStyle(job.status);
                    return (
                      <div
                        key={job.id}
                        onClick={() => handleSelectJob(job)}
                        className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                        style={card}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 8px 32px rgba(184,149,106,0.15)"}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.12)"}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{job.title || "Untitled"}</h3>
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
          ) : null}
        </div>
      </div>

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