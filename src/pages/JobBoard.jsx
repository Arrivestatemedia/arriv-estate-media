import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Briefcase, LayoutDashboard, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import JobCard from "../components/jobs/JobCard";
import CancelJobDialog from "../components/jobs/CancelJobDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function JobBoard() {
    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [bookingJob, setBookingJob] = useState(null);
    const [cancelJob, setCancelJob] = useState(null);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelSuccess, setCancelSuccess] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

  const [userEmail, setUserEmail] = React.useState(null);

  React.useEffect(() => {
    setUserEmail(localStorage.getItem('user_email'));
    
    // Update last_viewed_jobs_at timestamp for media partners
    const updateLastViewed = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (isAuth) {
          const currentUser = await base44.auth.me();
          if (currentUser?.user_type === 'media_partner') {
            await base44.auth.updateMe({ last_viewed_jobs_at: new Date().toISOString() });
          }
        }
      } catch (error) {
        console.error('Error updating last viewed:', error);
      }
    };
    
    updateLastViewed();
  }, []);

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["user"],
    queryFn: () => base44.auth.me(),
    retry: 1,
  });

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", filter, user?.email],
    queryFn: async () => {
      if (filter === "booked") {
        return base44.entities.Job.filter({ 
          booked_by: user?.email,
          status: "booked"
        }, "-created_date");
      }
      if (filter === "open") {
        return base44.entities.Job.filter({ 
          status: "open"
        }, "-created_date");
      }
      // Show all active jobs (open and booked), excluding completed/cancelled
      return base44.entities.Job.filter({ 
        status: { $in: ["open", "booked"] }
      }, "-created_date");
    },
    enabled: !userLoading,
  });

  const bookMutation = useMutation({
    mutationFn: async ({ id, data, mediaPartnerEmail }) => {
      const response = await base44.functions.invoke('bookJobAndSendCalendarInvite', { jobId: id, jobData: data, mediaPartnerEmail });
      return response.data;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previousJobs = queryClient.getQueryData(["jobs", filter, user?.email]);

      queryClient.setQueryData(["jobs", filter, user?.email], (old) =>
        old?.map((job) => (job.id === id ? { ...job, ...data } : job))
      );

      return { previousJobs };
    },
    onError: (err, variables, context) => {
      console.error('Booking error:', err);
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs", filter, user?.email], context.previousJobs);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setBookingJob(null);
      navigate(createPageUrl("MediaPartnerDashboard"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ jobId, reason }) => base44.functions.invoke('cancelJobWithNotification', { jobId, reason }),
    onMutate: async ({ jobId }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previousJobs = queryClient.getQueryData(["jobs", filter, user?.email]);
      
      queryClient.setQueryData(["jobs", filter, user?.email], (old) =>
        old?.map((job) => 
          job.id === jobId 
            ? { ...job, status: 'open', booked_by: null, booked_by_name: null, backup_booked_by: null, backup_booked_by_name: null, backup_booked_by_phone: null } 
            : job
        )
      );
      
      return { previousJobs };
    },
    onError: (error, variables, context) => {
      console.error('Cancel mutation error:', error);
      alert('Failed to cancel job: ' + (error.response?.data?.error || error.message));
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs", filter, user?.email], context.previousJobs);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setCancelSuccess(true);
    },
  });

  const backupMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["jobs"] });
      const previousJobs = queryClient.getQueryData(["jobs", filter, user?.email]);
      
      queryClient.setQueryData(["jobs", filter, user?.email], (old) =>
        old?.map((job) => (job.id === id ? { ...job, ...data } : job))
      );
      
      return { previousJobs };
    },
    onError: (err, variables, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs", filter, user?.email], context.previousJobs);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const handleBook = (job) => {
    setBookingJob(job);
  };

  const confirmBooking = async () => {
    if (!bookingJob) return;

    const storedEmail = localStorage.getItem('user_email');
    const storedName = localStorage.getItem('user_name');
    const email = user?.email || storedEmail;
    const name = user?.full_name || storedName;

    if (!email || !name) {
      alert("User data not available. Please refresh the page.");
      return;
    }

    const jobData = {
      status: "booked",
      booked_by: email,
      booked_by_name: name,
    };

    bookMutation.mutate({
      id: bookingJob.id,
      data: jobData,
      mediaPartnerEmail: email,
    });
  };

  const handleCancel = (job) => {
    setCancelJob(job);
    setCancelDialogOpen(true);
  };

  const handleCancelSubmit = (jobId, reason) => {
    cancelMutation.mutate({ jobId, reason });
  };

  const handleBookBackup = (job, phoneNumber) => {
    const storedEmail = localStorage.getItem('user_email');
    const storedName = localStorage.getItem('user_name');
    const email = user?.email || storedEmail;
    const name = user?.full_name || storedName;
    
    if (!email) return;
    
    backupMutation.mutate({
      id: job.id,
      data: {
        ...job,
        backup_booked_by: email,
        backup_booked_by_name: name,
        backup_booked_by_phone: phoneNumber,
      },
    });
  };

  // Pull to refresh handlers
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e) => {
    if (isRefreshing) return;
    
    const touchY = e.touches[0].clientY;
    const distance = touchY - touchStartY.current;
    
    if (distance > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(distance, 80));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && !isRefreshing) {
      setIsRefreshing(true);
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setTimeout(() => {
        setIsRefreshing(false);
        setPullDistance(0);
      }, 500);
    } else {
      setPullDistance(0);
    }
  };

  const filteredJobs = jobs
   .filter((job) => {
     if (filter === "open") return job.status === "open";
     // "booked" filter already handled in query, just display all results
     return true;
   })
   .filter((job) => {
     if (!searchQuery) return true;
     const search = searchQuery.toLowerCase();
     return (
       job.title?.toLowerCase().includes(search) ||
       job.location?.toLowerCase().includes(search) ||
       job.description?.toLowerCase().includes(search)
     );
   });

  return (
    <div 
      className="min-h-screen bg-[var(--bg-primary)]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 flex items-center justify-center z-30 transition-transform"
          style={{ transform: `translateY(${pullDistance - 40}px)` }}
        >
          <div className="bg-[var(--card-bg)] rounded-full p-2 shadow-lg border border-[var(--border-color)]">
            <RefreshCw 
              className={`w-5 h-5 text-[var(--accent-color)] ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: `rotate(${pullDistance * 4}deg)` }}
            />
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Available Gigs</h1>
            <p className="text-[var(--text-secondary)]">Browse and book jobs</p>
          </div>
          {user?.user_type === "media_partner" && (
            <Link to={createPageUrl("MediaPartnerDashboard")}>
              <Button className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#1A1A1A]/40" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-[#B8956A]/30 focus:border-[#B8956A]"
            />
          </div>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList className="bg-white border border-[#B8956A]/30">
              <TabsTrigger value="all" className="data-[state=active]:bg-[#B8956A] data-[state=active]:text-white">
                All Jobs
              </TabsTrigger>
              <TabsTrigger value="open" className="data-[state=active]:bg-[#B8956A] data-[state=active]:text-white">
                Open
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-[#1A1A1A]/60">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <Card className="border-2 border-dashed border-[#B8956A]/30 bg-white">
            <CardContent className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto mb-4 text-[#B8956A]/40" />
              <p className="text-[#1A1A1A]/60">
                {searchQuery ? "No jobs match your search." : "No jobs available at the moment."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredJobs.map((job) => {
              const userRole = localStorage.getItem('user_role') || user?.role;
              return (
                <JobCard 
                  key={job.id} 
                  job={job} 
                  isAdmin={userRole === 'admin'} 
                  userRole={userRole}
                  onBook={handleBook} 
                  onCancel={handleCancel}
                  onBookBackup={handleBookBackup}
                  onUpdateBackup={handleBookBackup}
                  currentUserEmail={userEmail || user?.email} 
                />
              );
            })}
          </div>
        )}

        <Dialog open={!!bookingJob} onOpenChange={() => setBookingJob(null)}>
          <DialogContent className="border-2 border-[#B8956A]/30">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Confirm Booking</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                Are you sure you want to book this job?
              </DialogDescription>
            </DialogHeader>
            {bookingJob && (
              <div className="py-4 space-y-2 text-sm">
                <p className="text-[#1A1A1A]">
                  <span className="font-medium">Job:</span> {bookingJob.title}
                </p>
                <p className="text-[#1A1A1A]">
                  <span className="font-medium">Location:</span> {bookingJob.location}
                </p>
                <p className="text-[#1A1A1A]">
                  <span className="font-medium">Pay:</span> <span className="text-[#B8956A] font-bold">${bookingJob.pay_rate}</span>
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setBookingJob(null)} className="border-[#1A1A1A]/20" disabled={bookMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={confirmBooking} className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={bookMutation.isPending}>
                {bookMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CancelJobDialog
          job={cancelJob}
          open={cancelDialogOpen}
          success={cancelSuccess}
          onOpenChange={(open) => {
            setCancelDialogOpen(open);
            if (!open) {
              setCancelJob(null);
              setCancelSuccess(false);
            }
          }}
          onSubmit={handleCancelSubmit}
          isLoading={cancelMutation.isPending}
          onClose={async (job) => {
            const storedEmail = localStorage.getItem('user_email');
            const storedName = localStorage.getItem('user_name');
            const contractorEmail = user?.email || storedEmail;
            const contractorName = user?.full_name || storedName;

            try {
              await Promise.all([
                base44.functions.invoke('reassignJob', { jobId: job.id }),
                base44.functions.invoke('notifyAdminOfCancellation', { 
                  jobId: job.id,
                  contractorName,
                  contractorEmail,
                  hasBackup: !!job.backup_booked_by,
                  backupName: job.backup_booked_by_name,
                  backupEmail: job.backup_booked_by
                })
              ]);
              queryClient.invalidateQueries({ queryKey: ["jobs"] });
              navigate(createPageUrl("JobBoard"));
            } catch (err) {
              console.error('Error:', err);
            }
          }}
        />
      </div>
    </div>
  );
}