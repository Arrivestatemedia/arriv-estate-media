import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { APPLICATION_STATUSES } from "@/lib/applicationStatus";
import AdminApplicationRow from "@/components/admin/AdminApplicationRow";
import { Search } from "lucide-react";

export default function AdminApplications() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const updateApp = async (id, data) => {
    await base44.entities.JobApplication.update(id, data);
    queryClient.invalidateQueries({ queryKey: ["job-applications"] });

    // Send the acceptance email when transitioning into "accepted"
    if (data.status === 'accepted') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'accepted') {
        try {
          await base44.functions.invoke('sendApplicationAcceptedEmail', { applicationId: id });
        } catch (err) {
          console.error('Acceptance email failed:', err);
        }
      }
    }

    // Send the waitlist email when transitioning into "accepted_waitlist"
    if (data.status === 'accepted_waitlist') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'accepted_waitlist') {
        try {
          await base44.functions.invoke('sendApplicationWaitlistEmail', { applicationId: id });
        } catch (err) {
          console.error('Waitlist email failed:', err);
        }
      }
    }

    // Send the application-closed email when transitioning into "denied"
    if (data.status === 'denied') {
      const prev = applications.find((a) => a.id === id);
      if (!prev || prev.status !== 'denied') {
        try {
          await base44.functions.invoke('sendApplicationClosedEmail', { applicationId: id });
        } catch (err) {
          console.error('Closed email failed:', err);
        }
      }
    }
  };

  const filtered = applications.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.full_name?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q)
    );
  });

  const counts = APPLICATION_STATUSES.reduce((acc, s) => {
    acc[s.value] = applications.filter((a) => a.status === s.value).length;
    return acc;
  }, {});

  const viewedCount = applications.filter((a) => a.portal_viewed_at).length;

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-[#1A1A1A] mb-1">Job Applications</h1>
        <p className="text-[#1A1A1A]/60 mb-6">
          Review applicants and update their status ·{" "}
          <span className="text-[#B8956A] font-medium">{viewedCount} of {applications.length}</span> have checked their portal
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {APPLICATION_STATUSES.map((s) => (
            <div key={s.value} className="bg-white border-2 border-[#B8956A]/20 rounded-xl p-4">
              <p className="text-sm text-[#1A1A1A]/60">{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{counts[s.value] || 0}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
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
            {APPLICATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <p className="text-center text-[#1A1A1A]/60 py-12">Loading applications...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[#1A1A1A]/60 py-12">No applications found.</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((app) => (
              <AdminApplicationRow key={app.id} app={app} onUpdate={updateApp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}