import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Briefcase, LayoutDashboard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import JobCard from "../components/jobs/JobCard";
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
  const queryClient = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.filter({ from_booking: true }, "-created_date"),
  });

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => base44.auth.me(),
  });

  const bookMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setBookingJob(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
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
    if (bookingJob && user) {
      bookMutation.mutate({
        id: bookingJob.id,
        data: {
          ...bookingJob,
          status: "booked",
          booked_by: user.email,
          booked_by_name: user.full_name,
        },
      });
    }
  };

  const handleCancel = (job) => {
    if (!user) return;
    
    // If there's a backup, promote them to primary
    if (job.backup_booked_by) {
      cancelMutation.mutate({
        id: job.id,
        data: {
          ...job,
          booked_by: job.backup_booked_by,
          booked_by_name: job.backup_booked_by_name,
          backup_booked_by: null,
          backup_booked_by_name: null,
          status: "booked",
        },
      });
    } else {
      // No backup, return to open
      cancelMutation.mutate({
        id: job.id,
        data: {
          ...job,
          booked_by: null,
          booked_by_name: null,
          status: "open",
        },
      });
    }
  };

  const handleBookBackup = (job) => {
    if (!user) return;
    backupMutation.mutate({
      id: job.id,
      data: {
        ...job,
        backup_booked_by: user.email,
        backup_booked_by_name: user.full_name,
      },
    });
  };

  const filteredJobs = jobs
    .filter((job) => {
      if (filter === "open") return job.status === "open";
      if (filter === "booked") return job.booked_by === user?.email || job.backup_booked_by === user?.email;
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
              <TabsTrigger value="booked" className="data-[state=active]:bg-[#B8956A] data-[state=active]:text-white">
                My Bookings
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
                currentUserEmail={user?.email} 
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
      </div>
    </div>
  );
}