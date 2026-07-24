import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Briefcase, DollarSign, Calendar, TrendingUp, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import JobForm from "../components/jobs/JobForm";
import JobCard from "../components/jobs/JobCard";
import PendingBookingCard from "../components/booking/PendingBookingCard";
import InviteUsersCard from "../components/dashboard/InviteUsersCard";
import OrientationVideoSetting from "../components/dashboard/OrientationVideoSetting";
import CompletedJobsSection from "../components/dashboard/CompletedJobsSection";
import { AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";

export default function Dashboard() {
  const [showForm, setShowForm] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.list("-created_date"),
  });

  useEffect(() => {
    const unsubscribe = base44.entities.Job.subscribe((event) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "jobs"
      });
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = base44.entities.Booking.subscribe((event) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => ["jobs", "pendingBookings", "allBookings"].includes(query.queryKey[0])
      });
    });
    return unsubscribe;
  }, [queryClient]);

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => base44.auth.me(),
  });

  const { data: pendingBookings = [] } = useQuery({
    queryKey: ["pendingBookings"],
    queryFn: () => base44.entities.Booking.filter({ status: "pending" }, "-created_date"),
  });

  const { data: allBookings = [] } = useQuery({
    queryKey: ["allBookings"],
    queryFn: () => base44.entities.Booking.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Job.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setShowForm(false);
      setEditingJob(null);
    },
  });

  const postToJobBoardMutation = useMutation({
    mutationFn: async (booking) => {
      const job = await base44.entities.Job.create({
        title: `${booking.package} - ${booking.street_address}`,
        type: "photo_video",
        description: booking.notes || "Booking approved from client request",
        location: `${booking.street_address}, ${booking.city}, ${booking.state}`,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: booking.total_price,
        status: "open",
        from_booking: true,
        booking_id: booking.id,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        notes: `Client: ${booking.client_name} (${booking.client_email})`
      });
      await base44.entities.Booking.update(booking.id, { status: "confirmed" });
      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["pendingBookings"] });
    },
  });

  const acceptForMyselfMutation = useMutation({
    mutationFn: async (booking) => {
      const job = await base44.entities.Job.create({
        title: `${booking.package} - ${booking.street_address}`,
        type: "photo_video",
        description: booking.notes || "Accepted directly by admin",
        location: `${booking.street_address}, ${booking.city}, ${booking.state}`,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: booking.total_price,
        status: "booked",
        from_booking: true,
        booking_id: booking.id,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        booked_by: user?.email,
        booked_by_name: user?.full_name,
        notes: `Client: ${booking.client_name} (${booking.client_email})`
      });
      await base44.entities.Booking.update(booking.id, { status: "confirmed" });
      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["pendingBookings"] });
    },
  });

  const handleSave = (data) => {
    if (editingJob) {
      updateMutation.mutate({ id: editingJob.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (job) => {
    setEditingJob(job);
    setShowForm(true);
  };

  const handleBook = (job) => {
    // Admin booking the job
    updateMutation.mutate({
      id: job.id,
      data: {
        status: "booked",
        booked_by: user?.email,
        booked_by_name: user?.full_name,
      },
    });
  };

  const handleBookBackup = (job) => {
    // This would be for non-admins, admins use onUpdateBackup
  };

  const handleUpdateBackup = (job, phone) => {
    updateMutation.mutate({
      id: job.id,
      data: {
        backup_booked_by: user?.email,
        backup_booked_by_name: user?.full_name,
        backup_booked_by_phone: phone,
      },
    });
  };

  const now = new Date();
  
  const approvedJobs = jobs.filter((j) => j.from_booking === true);
  
  const stats = {
    total: approvedJobs.length,
    open: jobs.filter((j) => j.status === "open" && j.from_booking === true).length,
    booked: jobs.filter((j) => j.status === "booked" && j.from_booking === true).length,
    totalPayout: allBookings
      .filter((b) => {
        const bookingDateTime = new Date(`${b.preferred_date}T${b.preferred_time || '00:00'}`);
        return bookingDateTime <= now && (b.status === "approved" || b.status === "confirmed");
      })
      .reduce((sum, b) => sum + (b.total_price || 0), 0),
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A]">Job Dashboard</h1>
            <p className="text-[#1A1A1A]/60 mt-1">Manage your gigs</p>
          </div>
          <Button
            onClick={() => {
              setEditingJob(null);
              setShowForm(!showForm);
            }}
            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            <Plus className="w-5 h-5 mr-2" />
            Post New Job
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-2 border-[#B8956A]/20 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-[#1A1A1A]/60 flex items-center justify-between">
                  Total Jobs
                  <Briefcase className="w-4 h-4 text-[#B8956A]" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-[#1A1A1A]">{stats.total}</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-[#B8956A]/20 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-[#1A1A1A]/60 flex items-center justify-between">
                  Open Jobs
                  <Calendar className="w-4 h-4 text-emerald-600" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-emerald-600">{stats.open}</p>
              </CardContent>
            </Card>

            <Link to={createPageUrl("JobBoard")} className="hover:no-underline block h-full">
              <Card className="border-2 border-[#B8956A]/20 bg-white cursor-pointer hover:shadow-lg transition-shadow h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-[#1A1A1A]/60 flex items-center justify-between pointer-events-none">
                    Booked
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600 pointer-events-none">{stats.booked}</p>
                </CardContent>
              </Card>
            </Link>

            <Card className="border-2 border-[#B8956A]/20 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-[#1A1A1A]/60 flex items-center justify-between">
                  Total Paid
                  <DollarSign className="w-4 h-4 text-[#B8956A]" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-[#B8956A]">${stats.totalPayout.toFixed(0)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <InviteUsersCard />
            <OrientationVideoSetting />
          </div>
        </div>

        <AnimatePresence>
          {showForm && (
            <div className="mb-8">
              <JobForm
                job={editingJob}
                onSave={handleSave}
                onCancel={() => {
                  setShowForm(false);
                  setEditingJob(null);
                }}
              />
            </div>
          )}
        </AnimatePresence>



        <div className="mb-4">
          <h2 className="text-xl font-semibold text-[#1A1A1A]">All Jobs</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-[#1A1A1A]/60">Loading jobs...</div>
        ) : approvedJobs.length === 0 ? (
          <Card className="border-2 border-dashed border-[#B8956A]/30 bg-white">
            <CardContent className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto mb-4 text-[#B8956A]/40" />
              <p className="text-[#1A1A1A]/60">No approved jobs yet. Create your first job to get started!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {approvedJobs.map((job) => (
              <JobCard key={job.id} job={job} isAdmin={true} onManage={handleEdit} onBook={handleBook} onBookBackup={handleBookBackup} onUpdateBackup={handleUpdateBackup} currentUserEmail={user?.email} userRole="admin" />
            ))}
          </div>
          )}

          <CompletedJobsSection
          jobs={jobs}
          user={user}
          onEdit={handleEdit}
          onBook={handleBook}
          onUpdateBackup={handleUpdateBackup}
          />
      </div>
    </div>
  );
}