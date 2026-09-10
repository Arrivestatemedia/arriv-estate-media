import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Briefcase, Plus, Loader2, Users, Brain, FileText, Search,
  BarChart3, Sparkles, Radar, Users2, Target, TrendingUp,
  MessageSquare, Award, HelpCircle, LayoutDashboard,
  GitBranch, Video, Globe, SquareCheckBig, ArrowLeft, Mail,
  Activity, CheckSquare, CalendarClock, Copy, Share2,
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
import ReminderQueueView from "@/components/khethaiq/ReminderQueueView";
import AsyncInterviewManagerContent from "@/components/interviews/AsyncInterviewManagerContent";
import PerformanceDataView from "@/components/hireiq/PerformanceDataView";
import JobPageBuilder from "@/components/khethaiq/JobPageBuilder";
import EditJobPageModal from "@/components/khethaiq/EditJobPageModal";
import CareersHubSettings from "@/components/khethaiq/CareersHubSettings";
import DistributeJobModal from "@/components/khethaiq/DistributeJobModal";
import { SALES_JOB_DEFAULTS } from "@/lib/salesJobDefaults";
import { MEDIA_JOB_DEFAULTS } from "@/lib/mediaJobDefaults";
import { MEDIA_JOB_ATLANTA_DEFAULTS } from "@/lib/mediaJobAtlantaDefaults";

// Map manifest icon names to lucide-react components.
// Matches the central KhethaIQ app's ICON_MAP.
const ICON_MAP = {
  LayoutDashboard, Sparkles, Briefcase, Users, Search, GitBranch,
  Video, FileText, SquareCheckBig, Brain, BarChart3: BarChart3,
  Radar, Users2, Target, TrendingUp, MessageSquare, Award,
  HelpCircle, Plus, Globe, Mail,
  Activity, CheckSquare, CalendarClock,
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
  display: "flex",
  flexDirection: "column",
};

const LIVE_BASE_URL = "https://app.arrivestatemedia.com";

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
  const [activeView, setActiveView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || "dashboard";
  });

  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCandidates, setCompareCandidates] = useState([]);
  const [initialTab, setInitialTab] = useState(null);
  const [preselectedCandidateId, setPreselectedCandidateId] = useState(null);
  const [pendingAppAction, setPendingAppAction] = useState(null);
  const [showJobPageBuilder, setShowJobPageBuilder] = useState(false);
  const [showCareersHubSettings, setShowCareersHubSettings] = useState(false);
  const [editingJobOpening, setEditingJobOpening] = useState(null);
  const [editingPreviewUrl, setEditingPreviewUrl] = useState(null);
  const [jobOpenings, setJobOpenings] = useState([]);
  const [linkingJob, setLinkingJob] = useState(null);
  const [duplicating, setDuplicating] = useState(null);
  const [distributingJob, setDistributingJob] = useState(null);

  // Navigation history stack — each entry is a snapshot of the view state.
  // Push the current state before navigating to a new one so the back button
  // restores exactly where the user was.
  const [history, setHistory] = useState([]);

  const snapshot = () => ({
    activeView,
    selectedJob,
    selectedCandidate,
    compareMode,
    compareCandidates,
    initialTab,
    preselectedCandidateId,
    scrollY: window.scrollY,
  });

  const navigateTo = (updater) => {
    setHistory(prev => [...prev, snapshot()]);
    if (typeof updater === "function") updater();
  };

  const [pendingScrollY, setPendingScrollY] = useState(null);

  const goBack = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const prev_state = prev[prev.length - 1];
      setActiveView(prev_state.activeView);
      setSelectedJob(prev_state.selectedJob);
      setSelectedCandidate(prev_state.selectedCandidate);
      setCompareMode(prev_state.compareMode);
      setCompareCandidates(prev_state.compareCandidates);
      setInitialTab(prev_state.initialTab);
      setPreselectedCandidateId(prev_state.preselectedCandidateId);
      setPendingScrollY(prev_state.scrollY ?? 0);
      return prev.slice(0, -1);
    });
  };

  // Restore scroll position after navigating back (waits one frame for DOM)
  useEffect(() => {
    if (pendingScrollY != null) {
      const y = pendingScrollY;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, y);
          setPendingScrollY(null);
        });
      });
    }
  }, [pendingScrollY]);

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
    // Load JobOpenings (public-facing job pages)
    try {
      const res = await base44.entities.JobOpening.list("-published_at", 100);
      const list = res?.data ?? res;
      setJobOpenings(Array.isArray(list) ? list : []);
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
    navigateTo(() => {
      setSelectedJob(job);
      setSelectedCandidate(null);
      setInitialTab(null);
      setPreselectedCandidateId(null);
    });
  };

  const handleSelectCandidate = (candidate) => {
    navigateTo(() => {
      setSelectedCandidate(candidate);
    });
  };

  const handleJobUpdated = (updatedJob) => {
    setSelectedJob(updatedJob);
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
  };

  // Tie an existing HireJob to a JobOpening page. If a matching JobOpening
  // already exists (by title), open the edit modal with it. Otherwise, create
  // a JobOpening from the HireJob's data first, then open the edit modal.
  const normalizeSourcePath = (url) => {
    if (!url) return null;
    try { return new URL(url, window.location.origin).pathname; }
    catch { return url; }
  };

  // Compute the special-page path for any job (HireJob or JobOpening).
  const getLegacyPath = (job) => {
    if (!job) return null;
    const isAtl = (job.title || "").toLowerCase().includes("atlanta") || (job.location || "").toLowerCase().includes("atlanta");
    return normalizeSourcePath(job.source_url)
      || (job.source_application_position === "sales_growth_advisor" ? "/SalesGrowthAdvisor"
        : isAtl ? "/MediaSpecialistAtl"
        : job.source_application_position === "media_specialist" ? "/MediaSpecialist" : null);
  };

  const handleEditPage = async (hireJob) => {
    const legacyUrl = getLegacyPath(hireJob);
    const match = legacyUrl
      ? jobOpenings.find(jo => normalizeSourcePath(jo.source_url) === legacyUrl)
      : jobOpenings.find(jo => jo.title === hireJob.title);
    if (match) {
      // Backfill source_url so legacy pages (e.g. /SalesGrowthAdvisor) can
      // find and render this JobOpening. Course-corrects older records that
      // were created before source_url was stored.
      if (!match.source_url && legacyUrl) {
        try {
          const upd = await base44.functions.invoke("createJobPage", {
            action: "update",
            job_opening_id: match.id,
            source_url: legacyUrl,
            email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
          });
          const updated = upd?.data?.job_opening || upd?.job_opening || { ...match, source_url: legacyUrl };
          setJobOpenings(prev => prev.map(j => j.id === match.id ? { ...j, ...updated } : j));
        } catch (_) {}
      }
      // Preview the special page itself (e.g. /MediaSpecialist), which
      // renders live from this JobOpening.
      setEditingPreviewUrl(legacyUrl || `/careers/${match.public_slug || match.job_id}`);
      setEditingJobOpening(match);
      return;
    }
    setLinkingJob(hireJob);
    try {
      // For the Sales Growth Advisor listing, pre-populate the JobOpening
      // with the EXACT content the public page (/SalesGrowthAdvisor) shows
      // by default — so the edit modal opens with the same words the page
      // displays, and edits stay in sync with the preview.
      const d = legacyUrl === "/SalesGrowthAdvisor" ? SALES_JOB_DEFAULTS
        : legacyUrl === "/MediaSpecialistAtl" ? MEDIA_JOB_ATLANTA_DEFAULTS
        : legacyUrl === "/MediaSpecialist" ? MEDIA_JOB_DEFAULTS : {};
      const res = await base44.functions.invoke("createJobPage", {
        action: "create",
        title: d.title || hireJob.title || "Untitled",
        department: hireJob.department || "",
        description: d.description_text || hireJob.description || "",
        responsibilities: d.responsibilities || hireJob.responsibilities || [],
        required_qualifications: d.required_qualifications || hireJob.required_qualifications || [],
        preferred_qualifications: hireJob.preferred_qualifications || [],
        skills: hireJob.skills || [],
        experience_requirements: hireJob.experience_requirements || "",
        compensation: d.compensation || hireJob.compensation || "",
        work_schedule: d.work_schedule || hireJob.work_schedule || "",
        employment_type: d.employment_type || hireJob.employment_type || "full_time",
        work_arrangement: d.work_arrangement || hireJob.work_arrangement || "onsite",
        location: d.location || hireJob.location || "",
        source_url: legacyUrl || hireJob.source_url || "",
        source_type: "text",
        page_description: d.page_description || hireJob.description || "",
        design_description: d.design_description || hireJob.design_description || "",
        email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
      });
      const data = res?.data ?? res;
      if (data?.success && data?.job_opening) {
        const newOpening = data.job_opening;
        setJobOpenings(prev => [newOpening, ...prev]);
        setEditingPreviewUrl(legacyUrl || `/careers/${newOpening.public_slug || newOpening.job_id}`);
        setEditingJobOpening(newOpening);
      } else {
        alert(data?.error || "Failed to create job page");
      }
    } catch (err) {
      alert("Failed to create job page: " + (err.message || "unknown error"));
    } finally {
      setLinkingJob(null);
    }
  };

  const goJobsHome = () => { goBack(); };

  // Duplicate a job and all of its elements: the HireJob record plus its
  // linked JobOpening (public job page), so the copy carries over every
  // field the original had.
  const handleDuplicateJob = async (job) => {
    if (!window.confirm(`This will create a copy of "${job.title || 'Untitled'}" including its job details and linked job page. The copy will be saved as a draft with "(Copy)" added to the title. Continue?`)) return;
    setDuplicating(job);
    try {
      const newTitle = `${job.title || "Untitled"} (Copy)`;
      const res = await base44.entities.HireJob.create({
        title: newTitle,
        department: job.department,
        description: job.description,
        responsibilities: job.responsibilities || [],
        required_qualifications: job.required_qualifications || [],
        preferred_qualifications: job.preferred_qualifications || [],
        skills: job.skills || [],
        experience_requirements: job.experience_requirements || "",
        performance_expectations: job.performance_expectations || "",
        compensation: job.compensation || "",
        work_schedule: job.work_schedule || "",
        source_type: job.source_type,
        source_url: job.source_url,
        source_application_position: job.source_application_position,
        role_success_profile: job.role_success_profile,
        role_profile_approved: false,
        scorecard_template: job.scorecard_template || [],
        round1_scorecard: job.round1_scorecard,
        status: "draft",
        created_by_name: localStorage.getItem("sales_member_name") || localStorage.getItem("user_name") || "Admin",
      });
      const newJob = res?.data ?? res;

      // Duplicate the linked JobOpening (job page) if one exists
      const linkedOpening = jobOpenings.find(jo => jo.title === job.title);
      if (linkedOpening) {
        try {
          await base44.functions.invoke("createJobPage", {
            action: "create",
            title: newTitle,
            email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
            department: linkedOpening.department || "",
            description: linkedOpening.description_text || "",
            responsibilities: linkedOpening.responsibilities || [],
            required_qualifications: linkedOpening.required_qualifications || [],
            preferred_qualifications: linkedOpening.preferred_qualifications || [],
            skills: linkedOpening.skills || [],
            experience_requirements: linkedOpening.experience_requirements || "",
            compensation: linkedOpening.compensation || "",
            work_schedule: linkedOpening.work_schedule || "",
            employment_type: linkedOpening.employment_type || "full_time",
            work_arrangement: linkedOpening.work_arrangement || "onsite",
            location: linkedOpening.location || "",
            benefits: linkedOpening.benefits || [],
            page_description: linkedOpening.page_description || "",
            design_description: linkedOpening.design_description || "",
            source_type: "text",
            source_url: "",
          });
        } catch (_) {}
      }

      setJobs(prev => [newJob, ...prev]);
      await loadJobs();
    } catch (err) {
      alert("Failed to duplicate job: " + (err.message || "unknown error"));
    } finally {
      setDuplicating(null);
    }
  };

  // Duplicate a JobOpening (job page) that has no matching HireJob — creates
  // a copy of the public page with a "(Copy)" title suffix.
  const handleDuplicateJobOpening = async (jobOpening) => {
    if (!window.confirm(`This will create a copy of the "${jobOpening.title || 'Untitled'}" job page with all its content. The copy will have "(Copy)" added to the title. Continue?`)) return;
    setDuplicating(jobOpening);
    try {
      const newTitle = `${jobOpening.title || "Untitled"} (Copy)`;
      const res = await base44.functions.invoke("createJobPage", {
        action: "create",
        title: newTitle,
        email: localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email') || "",
        department: jobOpening.department || "",
        description: jobOpening.description_text || "",
        responsibilities: jobOpening.responsibilities || [],
        required_qualifications: jobOpening.required_qualifications || [],
        preferred_qualifications: jobOpening.preferred_qualifications || [],
        skills: jobOpening.skills || [],
        experience_requirements: jobOpening.experience_requirements || "",
        compensation: jobOpening.compensation || "",
        work_schedule: jobOpening.work_schedule || "",
        employment_type: jobOpening.employment_type || "full_time",
        work_arrangement: jobOpening.work_arrangement || "onsite",
        location: jobOpening.location || "",
        benefits: jobOpening.benefits || [],
        page_description: jobOpening.page_description || "",
        design_description: jobOpening.design_description || "",
        source_type: "text",
        source_url: "",
      });
      const data = res?.data ?? res;
      if (data?.success && data?.job_opening) {
        setJobOpenings(prev => [data.job_opening, ...prev]);
      } else {
        alert(data?.error || "Failed to duplicate job page");
      }
    } catch (err) {
      alert("Failed to duplicate job page: " + (err.message || "unknown error"));
    } finally {
      setDuplicating(null);
    }
  };

  const DECISION_TO_APP_ACTION = {
    advance: { type: "select_status", status: "interview_invitation" },
    hold: { type: "select_status", status: "under_review" },
    another_interview: { type: "schedule_interview" },
    offer: { type: "select_status", status: "offer_extended" },
    decline: { type: "select_status", status: "offer_not_extended" },
  };

  const handleDecisionConfirmed = (decision) => {
    const action = DECISION_TO_APP_ACTION[decision];
    if (!action) return;
    navigateTo(() => {
      setPendingAppAction({ email: selectedCandidate?.email, ...action });
      setSelectedCandidate(null);
      setSelectedJob(null);
      setInitialTab(null);
      setPreselectedCandidateId(null);
      setActiveView("applications");
    });
  };

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
        navigateTo(() => {
          setSelectedJob(job);
          setInitialTab("questionnaire");
          setPreselectedCandidateId(candidateId);
        });
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

  // ── Canonical Khetha IQ sidebar ──
  // Reconciled to match the central Khetha IQ app's tab structure exactly
  // (order, labels, icons) for functional parity. The manifest logo is still
  // consumed from the central app; tab structure is canonical so this app
  // never shows extra tabs the central app doesn't.
  // The Reminders tab is Estate Media–local (not in the central app) — kept
  // per user request, to be backfilled to the central app.
  const CANONICAL_TABS = [
    { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { id: "ask_khetha", label: "Ask Khetha", icon: "Sparkles" },
    { id: "jobs", label: "Jobs", icon: "Briefcase" },
    { id: "candidates", label: "Candidates", icon: "Users" },
    { id: "talent_search", label: "Talent Search", icon: "Search" },
    { id: "talent_pools", label: "Talent Pools", icon: "Users" },
    { id: "pipeline", label: "Pipeline", icon: "GitBranch" },
    { id: "interviews", label: "Interviews", icon: "Video" },
    { id: "async_interviews", label: "Async Interviews", icon: "CalendarClock" },
    { id: "reminders", label: "Reminders", icon: "Mail" },
    { id: "offers", label: "Offers", icon: "FileText" },
    { id: "tasks", label: "Tasks", icon: "CheckSquare" },
    { id: "applications", label: "Applications", icon: "FileText" },
    { id: "portal", label: "Applicant Portal", icon: "Search" },
    { id: "learning", label: "Learning", icon: "Brain" },
    { id: "posthire", label: "Performance Data", icon: "Activity" },
    { id: "analytics", label: "Analytics", icon: "BarChart3" },
  ];

  // Map canonical tab ids to the local renderer's view ids
  const viewMap = {
    dashboard: "dashboard",
    ask_khetha: "ask",
    ask: "ask",
    jobs: "jobs",
    candidates: "candidates",
    talent_search: "search",
    search: "search",
    talent_pools: "pools",
    pools: "pools",
    pipeline: "pipeline",
    interviews: "interviews",
    async_interviews: "async_interviews",
    reminders: "reminders",
    offers: "offers",
    tasks: "tasks",
    applications: "applications",
    portal: "portal",
    learning: "learning",
    posthire: "posthire",
    analytics: "analytics",
  };

  // Build sidebar from the canonical list. If the manifest has a matching tab,
  // prefer its label (picks up central-app label changes); structure/order/
  // icons stay canonical so extra manifest tabs are filtered out.
  const manifestTabsById = {};
  (manifest?.tabs || []).forEach(t => { manifestTabsById[t.id] = t; });

  const sidebarItems = CANONICAL_TABS
    .map(t => ({
      id: t.id,
      view: viewMap[t.id] || t.id,
      label: manifestTabsById[t.id]?.label || t.label,
      icon: ICON_MAP[t.icon] || Briefcase,
    }))
    .filter(t => t.id);

  const manifestLogo = manifest?.logo_url || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top bar — Back button + GlobalSearch + Request New Hire */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <Button
              onClick={goBack}
              variant="outline"
              className="gap-1.5 shrink-0"
              style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowJobPageBuilder(true)}
            className="gap-1.5"
            style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" />
            Create Job Page
          </Button>
          <Button
            onClick={() => setShowCareersHubSettings(true)}
            variant="outline"
            className="gap-1.5"
            style={{ backgroundColor: "#FFFFFF", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
          >
            <Globe className="w-4 h-4" />
            Careers Hub
          </Button>
          <Button
            onClick={() => setShowCreate(true)}
            variant="outline"
            className="gap-1.5"
            style={{ backgroundColor: "#FFFFFF", color: TEXT_DARK, border: "1px solid rgba(184,149,106,0.3)", fontWeight: 600 }}
          >
            <Sparkles className="w-4 h-4" />
            Request New Hire
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar — rounded card matching central app layout */}
        <aside className="md:w-60 shrink-0">
          <div
            className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-2 md:pb-0 md:sticky md:top-24 md:h-[calc(100vh-7rem)] rounded-2xl p-3"
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
                    onClick={() => { navigateTo(() => { setSelectedJob(null); setSelectedCandidate(null); setCompareMode(false); setInitialTab(null); setActiveView(item.view); }); }}
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
          {/* Job detail — kept mounted (hidden via CSS) so the active tab,
              scroll position, and loaded candidates survive navigating to a
              candidate profile and back. */}
          {selectedJob && (
            <div style={{ display: selectedCandidate || (compareMode && compareCandidates.length >= 2) ? "none" : "block" }}>
              <JobDetailPanel
                job={selectedJob}
                onBack={goJobsHome}
                onSelectCandidate={handleSelectCandidate}
                onCompare={() => navigateTo(() => setCompareMode(true))}
                onJobUpdated={handleJobUpdated}
                onDelete={handleDeleteJob}
                initialTab={initialTab}
                preselectedCandidateId={preselectedCandidateId}
              />
            </div>
          )}

          {/* Candidate detail — rendered on top of the hidden job panel */}
          {selectedCandidate && (
            <CandidateDetailPanel
              candidate={selectedCandidate}
              job={selectedJob || jobs.find(j => j.id === selectedCandidate.job_id)}
              onBack={goBack}
              onCandidateUpdated={setSelectedCandidate}
              onDecisionConfirmed={handleDecisionConfirmed}
            />
          )}

          {/* Compare mode */}
          {compareMode && compareCandidates.length >= 2 && (
            <ComparePanel candidates={compareCandidates} jobs={jobs} onBack={goBack} />
          )}

          {/* Sidebar views — only when no detail panel is active */}
          {!selectedJob && !selectedCandidate && !compareMode && (
            <>
              {activeView === "dashboard" ? (
                <RecruitingAssistantHome onStartSearch={() => navigateTo(() => setActiveView("search"))} />
              ) : activeView === "ask" ? (
                <AskKhethaChat />
              ) : activeView === "search" ? (
                <RecruitingChat onReviewProspects={() => navigateTo(() => setActiveView("candidates"))} />
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
              ) : activeView === "async_interviews" ? (
                <AsyncInterviewManagerContent />
              ) : activeView === "reminders" ? (
                <ReminderQueueView />
              ) : activeView === "offers" ? (
                <OffersView onSelectCandidate={handleSelectCandidate} />
              ) : activeView === "applications" ? (
                <ApplicationsPanel pendingAction={pendingAppAction} onPendingActionConsumed={() => setPendingAppAction(null)} />
              ) : activeView === "portal" ? (
                <div className="max-w-2xl mx-auto">
                  <ApplicantPortalPanel />
                </div>
              ) : activeView === "analytics" ? (
                <AnalyticsPanel />
              ) : activeView === "learning" ? (
                <LearningPanel />
              ) : activeView === "posthire" ? (
                <PerformanceDataView />
              ) : activeView === "jobs" ? (
            <div className="space-y-5">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Jobs</h1>
                <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Open Jobs Needing Candidates</p>
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
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Existing jobs — clicking opens the job detail (questionnaire, applicants, etc.) */}
                  {jobs.map(job => {
                    const ss = statusStyle(job.status);
                    const jobPath = getLegacyPath(job);
                    const linkedOpening = jobPath
                      ? jobOpenings.find(jo => normalizeSourcePath(jo.source_url) === jobPath)
                      : jobOpenings.find(jo => jo.title === job.title);
                    // "View Listing" opens the special page itself (e.g.
                    // /MediaSpecialist), which renders live from the JobOpening.
                    const listingUrl = jobPath || (linkedOpening
                      ? `/careers/${linkedOpening.public_slug || linkedOpening.job_id}`
                      : null);
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
                        <p className="text-sm mb-1" style={{ color: MUTED_LIGHT }}>{job.department || "No department"}</p>
                        {job.experience_requirements && (
                          <p className="text-xs mb-4" style={{ color: MUTED_LIGHT }}>{job.experience_requirements}</p>
                        )}
                        {listingUrl && (
                          <div className="flex justify-end mb-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); setDistributingJob({ ...job, public_slug: linkedOpening?.public_slug, job_id: linkedOpening?.job_id || job.id }); }}
                              className="text-xs flex items-center gap-1.5 font-medium"
                              style={{ color: GOLD }}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              Distribute
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-auto pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.12)" }}>
                          {listingUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); window.open(`${LIVE_BASE_URL}${listingUrl}`, "_blank"); }}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                              style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                            >
                              View Listing
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPage(job);
                            }}
                            disabled={linkingJob?.id === job.id}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
                            style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                          >
                            {linkingJob?.id === job.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : null}
                            Edit Page
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicateJob(job); }}
                            disabled={duplicating?.id === job.id}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
                            style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                          >
                            {duplicating?.id === job.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : <Copy className="w-3 h-3" />}
                            Duplicate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* JobOpening records — only show those WITHOUT a matching HireJob
                      (HireJobs that have been linked to a JobOpening already display
                      their own card above with View Listing + Edit Page buttons) */}
                  {jobOpenings.filter(j => j.status === "open" && !jobs.some(hj => {
                    const hp = getLegacyPath(hj);
                    return hp && normalizeSourcePath(j.source_url) === hp;
                  })).map(job => {
                    const ss = statusStyle(job.status);
                    return (
                      <div
                        key={job.id}
                        onClick={() => window.open(`${LIVE_BASE_URL}/careers/${job.public_slug || job.job_id}`, "_blank")}
                        className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                        style={card}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 8px 32px rgba(184,149,106,0.15)"}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,0.12)"}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{job.title || "Untitled"}</h3>
                          <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: ss.bg, color: ss.text }}>{job.status}</span>
                        </div>
                        <p className="text-sm mb-1" style={{ color: MUTED_LIGHT }}>{job.department || "No department"}</p>
                        <div className="flex items-center gap-3 text-xs flex-wrap mb-4" style={{ color: MUTED_LIGHT }}>
                          {job.location && <span>{job.location}</span>}
                          {job.employment_type && <span className="capitalize">{job.employment_type.replace(/_/g, " ")}</span>}
                          {job.work_arrangement && <span className="capitalize">{job.work_arrangement}</span>}
                        </div>
                        <div className="flex justify-end mb-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDistributingJob(job); }}
                            className="text-xs flex items-center gap-1.5 font-medium"
                            style={{ color: GOLD }}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            Distribute
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-auto pt-3" style={{ borderTop: "1px solid rgba(184,149,106,0.12)" }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const jp = normalizeSourcePath(job.source_url);
                              setEditingPreviewUrl(jp || `/careers/${job.public_slug || job.job_id}`);
                              setEditingJobOpening(job);
                            }}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                            style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                          >
                            Edit Page
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicateJobOpening(job); }}
                            disabled={duplicating?.id === job.id}
                            className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1"
                            style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD, border: "1px solid rgba(184,149,106,0.3)" }}
                          >
                            {duplicating?.id === job.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : <Copy className="w-3 h-3" />}
                            Duplicate
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
            </>
          )}
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

      {/* Create Job Page modal */}
      {showJobPageBuilder && (
        <JobPageBuilder
          onClose={() => setShowJobPageBuilder(false)}
          onCreated={() => { loadJobs(); }}
        />
      )}

      {/* Careers Hub Settings modal */}
      {showCareersHubSettings && (
        <CareersHubSettings onClose={() => setShowCareersHubSettings(false)} />
      )}

      {/* Distribute Job modal */}
      {distributingJob && (
        <DistributeJobModal
          job={distributingJob}
          onClose={() => setDistributingJob(null)}
        />
      )}

      {/* Edit Job Page modal */}
      {editingJobOpening && (
        <EditJobPageModal
          jobOpening={editingJobOpening}
          previewUrl={editingPreviewUrl}
          onClose={() => { setEditingJobOpening(null); setEditingPreviewUrl(null); }}
          onSaved={(updated) => {
            setEditingJobOpening(null);
            setEditingPreviewUrl(null);
            // Update the jobOpenings list in place
            setJobOpenings(prev => prev.map(j => j.id === updated?.id ? { ...j, ...updated } : j));
          }}
        />
      )}
    </div>
  );
}