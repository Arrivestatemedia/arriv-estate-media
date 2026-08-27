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

const POSITION_TABS = [
  { value: "media_specialist", label: "Media Specialist", icon: Camera, statuses: APPLICATION_STATUSES },
  { value: "sales_growth_advisor", label: "Sales Growth Advisor", icon: Briefcase, statuses: SALES_STATUSES },
];

const positionOf = (app) => app.position || "media_specialist";

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

  useEffect(() => {
    const unsub = base44.entities.JobApplication.subscribe(() =>
      queryClient.invalidateQueries({ queryKey: ["job-applications"] })
    );
    return unsub;
  }, [queryClient]);

  // Auto-switch to the correct tab/filter when a pending action arrives
  useEffect(() => {
    if (!pendingAction || !applications.length) return;
    const match = applications.find(a => a.email?.toLowerCase() === pendingAction.email?.toLowerCase());
    if (match) {
      setPositionTab(positionOf(match));
      setShowArchived(!!match.archived);
      setStatusFilter("all");
      setSearch("");
    }
  }, [pendingAction, applications]);

  const deleteApp = async (id) => {
    await base44.entities.JobApplication.delete(id);
    queryClient.invalidateQueries({ queryKey: ["job-applications"] });
  };

  const updateApp = async (id, data) => {
    await base44.entities.JobApplication.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["job-applications"] });

    if (data.status === 'accepted') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'accepted') {
        try { await base44.functions.invoke('sendApplicationAcceptedEmail', { applicationId: id }); } catch (err) { console.error('Acceptance email failed:', err); }
      }
    }
    if (data.status === 'accepted_waitlist') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'accepted_waitlist') {
        try { await base44.functions.invoke('sendApplicationWaitlistEmail', { applicationId: id }); } catch (err) { console.error('Waitlist email failed:', err); }
      }
    }
    if (data.status === 'denied') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'denied') {
        try {
          await base44.functions.invoke('sendApplicationClosedEmail', { applicationId: id });
          await base44.entities.JobApplication.update(id, { archived: true });
          queryClient.invalidateQueries({ queryKey: ["job-applications"] });
        } catch (err) { console.error('Closed email failed:', err); }
      }
    }
    if (data.status === 'interview_invitation') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'interview_invitation') {
        try { await base44.functions.invoke('sendSalesInterviewInvitation', { applicationId: id }); } catch (err) { console.error('Sales interview invitation email failed:', err); }
      }
    }
    if (data.status === 'offer_extended') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'offer_extended') {
        try { await base44.functions.invoke('sendSalesOfferExtendedEmail', { applicationId: id }); } catch (err) { console.error('Sales offer-extended email failed:', err); }
      }
    }
    if (data.status === 'offer_not_extended') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'offer_not_extended') {
        try {
          await base44.functions.invoke('sendSalesOfferNotExtendedEmail', { applicationId: id });
          await base44.entities.JobApplication.update(id, { archived: true });
          queryClient.invalidateQueries({ queryKey: ["job-applications"] });
        } catch (err) { console.error('Sales offer-not-extended email failed:', err); }
      }
    }
  };

  const activeTab = POSITION_TABS.find((t) => t.value === positionTab);
  const statuses = activeTab.statuses;

  const tabApps = applications.filter(
    (a) => positionOf(a) === positionTab && (!!a.archived) === showArchived
  );

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

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
        Review applicants and update their status ·{" "}
        <span className="font-medium" style={{ color: "#B8956A" }}>{viewedCount} of {tabApps.length}</span> have checked their portal
      </p>

      {/* Position tabs */}
      <div className="flex gap-2 flex-wrap">
        {POSITION_TABS.map((t) => {
          const Icon = t.icon;
          const active = positionTab === t.value;
          const count = applications.filter((a) => positionOf(a) === t.value).length;
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

      {positionTab === "sales_growth_advisor" && (
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