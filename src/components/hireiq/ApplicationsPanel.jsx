import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { APPLICATION_STATUSES, SALES_STATUSES } from "@/lib/applicationStatus";
import AdminApplicationRow from "@/components/admin/AdminApplicationRow";
import AdminSalesApplicationRow from "@/components/admin/AdminSalesApplicationRow";
import SalesWelcomeVideoControl from "@/components/admin/SalesWelcomeVideoControl";
import SalesTrainingVideosControl from "@/components/admin/SalesTrainingVideosControl";
import QueuedApplicationEmails from "@/components/admin/QueuedApplicationEmails";
import AcceptedPendingPreviewLinks from "@/components/admin/AcceptedPendingPreviewLinks";
import { Search, Briefcase, Camera } from "lucide-react";
import { toast } from "sonner";

const positionOf = (app) => app.position || "media_specialist";

// Short region label for a Sales Growth Advisor job opening, derived from its
// location string (e.g. "Atlanta, GA — Field-based..." → "Atlanta, GA").
const regionFromOpening = (o) => {
  const loc = (o?.location || "").trim();
  if (!loc) return o?.title || "Sales";
  const head = loc.split("—")[0].trim();
  return head || loc;
};

export default function ApplicationsPanel({ pendingAction, onPendingActionConsumed }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [positionTab, setPositionTab] = useState("media_specialist");
  const [showArchived, setShowArchived] = useState(false);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["job-applications"],
    queryFn: () => base44.entities.JobApplication.list("-created_date", 200),
  });

  // Job openings are needed to label the per-opening Sales tabs (Atlanta / DMV).
  const { data: openings = [] } = useQuery({
    queryKey: ["job-openings-for-applications"],
    queryFn: async () => {
      const res = await base44.entities.JobOpening.list("-created_date", 100);
      return res?.items ?? res ?? [];
    },
  });

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = base44.entities.JobApplication.subscribe(() =>
        queryClient.invalidateQueries({ queryKey: ["job-applications"] })
      );
    } catch (e) {
      console.error('[ApplicationsPanel] subscribe failed:', e);
    }
    return unsub;
  }, [queryClient]);

  // Auto-switch to the correct tab/filter when a pending action arrives
  useEffect(() => {
    if (!pendingAction || !applications.length) return;
    const match = applications.find(a => a.email?.toLowerCase() === pendingAction.email?.toLowerCase());
    if (match) {
      setPositionTab(
        positionOf(match) === "sales_growth_advisor"
          ? (match.job_opening_id || "sales_unassigned")
          : "media_specialist"
      );
      setShowArchived(!!match.archived);
      setStatusFilter("all");
      setSearch("");
    }
  }, [pendingAction, applications]);

  const deleteApp = async (id) => {
    await base44.entities.JobApplication.delete(id);
    queryClient.invalidateQueries({ queryKey: ["job-applications"] });
  };

  const updateApp = async (id, data, opts = {}) => {
    const prev = applications.find((a) => a.id === id);
    const prevStatus = prev?.status;

    // Map each email-triggering status to its backend email function.
    const emailTriggers = {
      accepted: 'sendApplicationAcceptedEmail',
      accepted_waitlist: 'sendApplicationWaitlistEmail',
      denied: 'sendApplicationClosedEmail',
      interview_invitation: 'sendSalesInterviewInvitation',
      offer_extended: 'sendSalesOfferExtendedEmail',
      offer_not_extended: 'sendSalesOfferNotExtendedEmail',
    };
    const emailFn = emailTriggers[data.status];
    const shouldSendEmail = emailFn && (!prev || prevStatus !== data.status) && !opts.skipEmail;

    // Stamp the interview-invitation send date at the moment the admin sends it,
    // so the stale-applicant auto-archive rule measures from the invitation date
    // (not the submission date).
    const payload = { ...data };
    if (data.status === 'interview_invitation' && (!prev || prevStatus !== 'interview_invitation')) {
      payload.interview_invitation_sent_at = new Date().toISOString();
    }

    // Update the status immediately so the admin's selection always takes effect,
    // then send the email best-effort. A delivery failure warns via toast but
    // does not block the status change.
    await base44.entities.JobApplication.update(id, payload);
    queryClient.invalidateQueries({ queryKey: ["job-applications"] });

    if (shouldSendEmail) {
      try {
        const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
        await base44.functions.invoke(emailFn, { applicationId: id, salesMemberId });
      } catch (err) {
        toast.error(`Status updated, but the ${data.status.replace(/_/g, ' ')} email failed: ${err.message || 'email service error'}.`);
      }
    }

    // Archive closed/denied applications after the status update.
    if (data.status === 'denied' || data.status === 'offer_not_extended') {
      try {
        await base44.entities.JobApplication.update(id, { archived: true });
        queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      } catch (err) { console.error('Archive failed:', err); }
    }
  };

  // Build the tab list: Media Specialist, then one tab per Sales Growth Advisor
  // job opening (e.g. Atlanta, DMV), then an Unassigned bucket if needed.
  const openingByJobId = React.useMemo(() => {
    const m = {};
    for (const o of openings) m[o.job_id] = o;
    return m;
  }, [openings]);

  const tabs = React.useMemo(() => {
    const salesCounts = {};
    let unassigned = 0;
    for (const a of applications) {
      if (positionOf(a) !== "sales_growth_advisor") continue;
      const jid = a.job_opening_id;
      if (jid) salesCounts[jid] = (salesCounts[jid] || 0) + 1;
      else unassigned += 1;
    }
    const salesTabs = Object.keys(salesCounts)
      .map((jid) => ({
        value: jid,
        label: `Sales — ${regionFromOpening(openingByJobId[jid])}`,
        icon: Briefcase,
        isSales: true,
        statuses: SALES_STATUSES,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (unassigned > 0) {
      salesTabs.push({ value: "sales_unassigned", label: "Sales — Unassigned", icon: Briefcase, isSales: true, statuses: SALES_STATUSES });
    }
    return [
      { value: "media_specialist", label: "Media Specialist", icon: Camera, isSales: false, statuses: APPLICATION_STATUSES },
      ...salesTabs,
    ];
  }, [applications, openingByJobId]);

  const activeTab = tabs.find((t) => t.value === positionTab) || tabs[0];
  const statuses = activeTab.statuses;

  const tabApps = applications.filter((a) => {
    if (!!a.archived !== showArchived) return false;
    if (positionTab === "media_specialist") return positionOf(a) === "media_specialist";
    if (positionTab === "sales_unassigned") return positionOf(a) === "sales_growth_advisor" && !a.job_opening_id;
    return positionOf(a) === "sales_growth_advisor" && a.job_opening_id === positionTab;
  });

  const filtered = tabApps.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
  });

  const counts = statuses.reduce((acc, s) => {
    acc[s.value] = tabApps.filter((a) => a.status === s.value).length;
    return acc;
  }, {});

  const viewedCount = tabApps.filter((a) => a.portal_viewed_at).length;

  const tabCount = (t) => {
    if (t.value === "media_specialist") return applications.filter((a) => positionOf(a) === "media_specialist").length;
    if (t.value === "sales_unassigned") return applications.filter((a) => positionOf(a) === "sales_growth_advisor" && !a.job_opening_id).length;
    return applications.filter((a) => positionOf(a) === "sales_growth_advisor" && a.job_opening_id === t.value).length;
  };

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
        Review applicants and update their status ·{" "}
        <span className="font-medium" style={{ color: "#B8956A" }}>{viewedCount} of {tabApps.length}</span> have checked their portal
      </p>

      {/* Position tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = positionTab === t.value;
          const count = tabCount(t);
          return (
            <button
              key={t.value}
              onClick={() => { setPositionTab(t.value); setStatusFilter("all"); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                active
                  ? "bg-[#1A1A1A] text-[#FFFBF5] border-[#1A1A1A]"
                  : "bg-white text-[#1A1A1A]/70 border-[#B8956A]/20 hover:border-[#B8956A]/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-[#FFFBF5]/20" : "bg-[#B8956A]/10 text-[#B8956A]"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <QueuedApplicationEmails />

      {positionTab === "media_specialist" && (
        <AcceptedPendingPreviewLinks applications={applications} />
      )}

      {activeTab.isSales && (
        <>
          <SalesWelcomeVideoControl />
          <SalesTrainingVideosControl />
        </>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statuses.map((s) => (
          <div key={s.value} className="bg-white border-2 border-[#B8956A]/20 rounded-xl p-4">
            <p className="text-sm text-[#1A1A1A]/60">{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{counts[s.value] || 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1A1A1A]/40" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 rounded-md border border-[#B8956A]/30 bg-white px-3"
        >
          <option value="all">All Statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 h-11 px-3 rounded-md border border-[#B8956A]/30 bg-white cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="w-4 h-4 accent-[#B8956A]"
          />
          <span className="text-sm font-medium text-[#1A1A1A]/70">
            {showArchived ? "Showing Archived" : "Show Archived"}
          </span>
        </label>
      </div>

      {isLoading ? (
        <p className="text-center text-[#1A1A1A]/60 py-12">Loading applications...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[#1A1A1A]/60 py-12">No {activeTab.label} applications found.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((app) => {
            const isPendingMatch = pendingAction && app.email?.toLowerCase() === pendingAction.email?.toLowerCase();
            return positionOf(app) === "sales_growth_advisor" ? (
              <AdminSalesApplicationRow
                key={app.id}
                app={app}
                onUpdate={updateApp}
                onDelete={deleteApp}
                autoExpand={isPendingMatch}
                autoAction={isPendingMatch ? pendingAction : null}
                onAutoActionDone={onPendingActionConsumed}
              />
            ) : (
              <AdminApplicationRow key={app.id} app={app} onUpdate={updateApp} onDelete={deleteApp} />
            );
          })}
        </div>
      )}
    </div>
  );
}