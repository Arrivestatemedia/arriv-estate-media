import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Briefcase, LayoutDashboard } from "lucide-react";
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
    const [filter, setFilter] = useState("all"); // "all" or "open"
    const [searchQuery, setSearchQuery] = useState("");
    const [bookingJob, setBookingJob] = useState(null);
    const [cancelJob, setCancelJob] = useState(null);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelSuccess, setCancelSuccess] = useState(false);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

  const [userEmail, setUserEmail] = React.useState(null);

  React.useEffect(() => {
    setUserEmail(localStorage.getItem('user_email'));
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
          booked_by: user?.email
        });
      }
      if (filter === "open") {
        return base44.entities.Job.filter({ status: "open", from_booking: true }, "-created_date");
      }
      return base44.entities.Job.filter({ from_booking: true }, "-created_date");
    },
    enabled: !userLoading,
  });

  const bookMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setBookingJob(null);
      navigate(createPageUrl("ContractorDashboard"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ jobId, reason }) => base44.functions.invoke('cancelJobWithNotification', { jobId, reason }),
    onSuccess: (response) => {
      // Job cancelled - contractor is no longer assigned
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setCancelSuccess(true);
    },
    onError: (error) => {
      console.error('Cancel mutation error:', error);
      alert('Failed to cancel job: ' + (error.response?.data?.error || error.message));
    },
  });

  const backupMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const handleBook = (job) => {
    setBookingJob(job);
  };

  const confirmBooking = () => {
    if (!bookingJob) return;
    
    const storedEmail = localStorage.getItem('user_email');
    const storedName = localStorage.getItem('user_name');
    const email = user?.email || storedEmail;
    const name = user?.full_name || storedName;
    
    if (!email || !name) {
      alert("User data not available. Please refresh the page.");
      return;
    }
    
    bookMutation.mutate({
      id: bookingJob.id,
      data: {
        ...bookingJob,
        status: "booked",
        booked_by: email,
        booked_by_name: name,
      },
    });
  };

  const handleCancel = (job) => {
    setCancelJob(job);
    setCancelDialogOpen(true);
  };

  const handleCancelSubmit = (jobId, reason) => {
    const userEmail = localStorage.getItem('user_email');
    if (!userEmail) {
      alert('User email not found. Please sign in again.');
      return;
    }
    cancelMutation.mutate({ jobId, reason, userEmail });
  };

  const handleBookBackup = (job, phoneNumber) => {
    if (!user) return;
    backupMutation.mutate({
      id: job.id,
      data: {
        ...job,
        backup_booked_by: user.email,
        backup_booked_by_name: user.full_name,
        backup_booked_by_phone: phoneNumber,
      },
    });
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
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Available Gigs</h1>
            <p className="text-[#1A1A1A]/60">Browse and book jobs</p>
          </div>
          {user?.user_type === "contractor" && (
            <Link to={createPageUrl("ContractorDashboard")}>
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
            {filteredJobs.map((job) => (
              <JobCard 
                key={job.id} 
                job={job} 
                isAdmin={false} 
                onBook={handleBook} 
                onCancel={handleCancel}
                onBookBackup={handleBookBackup}
                onUpdateBackup={handleBookBackup}
                currentUserEmail={userEmail || user?.email} 
              />
            ))}
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
              <Button variant="outline" onClick={() => setBookingJob(null)} className="border-[#1A1A1A]/20">
                Cancel
              </Button>
              <Button onClick={confirmBooking} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                Confirm Booking
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CancelJobDialog
          job={cancelJob}
          open={cancelDialogOpen}
          success={cancelSuccess}
          onOpenChange={(open) => {
            if (!open && cancelJob) {
              // Dialog is closing - reassign the job
              base44.functions.invoke('reassignJob', { jobId: cancelJob.id })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: ["jobs"] });
                  navigate(createPageUrl("JobBoard"));
                })
                .catch(err => console.error('Reassign error:', err));
            }
            setCancelDialogOpen(open);
            if (!open) {
              setCancelJob(null);
              setCancelSuccess(false);
            }
          }}
          onSubmit={handleCancelSubmit}
          isLoading={cancelMutation.isPending}
        />
      </div>
    </div>
  );
}