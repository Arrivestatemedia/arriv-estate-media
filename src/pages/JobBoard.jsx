import React, { useState, useRef, useEffect } from "react";
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
import BackgroundCheckAuthorizationModal from "../components/backgroundcheck/BackgroundCheckAuthorizationModal";
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
    const [showApparelRequired, setShowApparelRequired] = useState(false);
  const [bgAuthOpen, setBgAuthOpen] = useState(false);
  const [bgAuthContext, setBgAuthContext] = useState(null);
  const [bgPendingOpen, setBgPendingOpen] = useState(false);
  const [bgFailedOpen, setBgFailedOpen] = useState(false);
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

  const { data: acceptedJobs = [] } = useQuery({
    queryKey: ["accepted-jobs-count", user?.email],
    queryFn: () => base44.entities.Job.filter({ booked_by: user?.email }),
    enabled: !!user?.email && user?.user_type === "media_partner",
  });
  const acceptedJobsCount = acceptedJobs.filter(j =>
    ["booked", "in_progress", "completed", "archived"].includes(j.status)
  ).length;
  const apparelBlocked = user?.user_type === "media_partner" && !user?.apparelPurchased && acceptedJobsCount >= 2;

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", filter, user?.email, userEmail, user?.state, user?.coverage_lat, user?.max_travel_distance],
    queryFn: async () => {
      if (filter === "booked") {
        const email = user?.email || userEmail;
        if (!email) return [];
        return base44.entities.Job.filter({ 
          booked_by: email,
          status: "booked",
          from_booking: true
        }, "-created_date");
      }
      
      // Get user's state for filtering
      const userState = user?.state;
      const baseQuery = {
        status: filter === "open" ? "open" : { $in: ["open", "booked"] },
        from_booking: true
      };
      
      // For media partners, filter by state
      if (user?.user_type === "media_partner" && userState) {
        baseQuery.state = userState;
      }
      
      return base44.entities.Job.filter(baseQuery, "-created_date");
    },
    enabled: filter !== "booked" || !!user?.email || !!userEmail,
  });

  const [jobDistances, setJobDistances] = useState({});
  const [filteringByDistance, setFilteringByDistance] = useState(false);
  const geocodeCache = useRef({});

  const partnerEmail = user?.email || userEmail;
  const { data: coverage } = useQuery({
    queryKey: ["coverage-area", partnerEmail],
    queryFn: async () => {
      const res = await base44.functions.invoke('getCoverageArea', { email: partnerEmail });
      return res.data;
    },
    enabled: !!partnerEmail,
  });

  const maxDistance = coverage?.max_travel_distance;
  // Filter once we know the coverage center + max distance. The center may be
  // stored as lat/lng, or geocoded from coverage_area on the fly (see effect below).
  const hasCoverage =
    maxDistance != null &&
    (coverage?.coverage_area != null ||
      (coverage?.coverage_lat != null && coverage?.coverage_lng != null));

  const waitForGoogle = () =>
    new Promise((resolve) => {
      if (window.google?.maps?.Geocoder) return resolve(true);
      let tries = 0;
      const iv = setInterval(() => {
        if (window.google?.maps?.Geocoder || tries > 25) {
          clearInterval(iv);
          resolve(!!window.google?.maps?.Geocoder);
        }
        tries++;
      }, 200);
    });

  const geocodeAddress = async (address) => {
    const ok = await waitForGoogle();
    if (!ok) return null;
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === "OK" && results && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          resolve(null);
        }
      });
    });
  };

  const haversineMiles = (lat1, lng1, lat2, lng2) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  useEffect(() => {
    if (!hasCoverage) {
      setJobDistances({});
      setFilteringByDistance(false);
      return;
    }
    let cancelled = false;
    setFilteringByDistance(true);
    (async () => {
      // Resolve the coverage center: use stored lat/lng, otherwise geocode coverage_area.
      let cLat = coverage?.coverage_lat;
      let cLng = coverage?.coverage_lng;
      if ((cLat == null || cLng == null) && coverage?.coverage_area) {
        const center = await geocodeAddress(coverage.coverage_area);
        if (center) {
          cLat = center.lat;
          cLng = center.lng;
        }
      }
      if (cancelled) return;
      if (cLat == null || cLng == null) {
        setJobDistances({});
        setFilteringByDistance(false);
        return;
      }
      const coordsByLocation = {};
      const uniqueLocations = [
        ...new Set(jobs.map((j) => j.location).filter(Boolean)),
      ];
      for (const loc of uniqueLocations) {
        if (geocodeCache.current[loc]) {
          coordsByLocation[loc] = geocodeCache.current[loc];
          continue;
        }
        const coords = await geocodeAddress(loc);
        geocodeCache.current[loc] = coords;
        coordsByLocation[loc] = coords;
      }
      if (cancelled) return;
      const distMap = {};
      for (const job of jobs) {
        const coords = job.location ? coordsByLocation[job.location] : null;
        distMap[job.id] = coords
          ? haversineMiles(cLat, cLng, coords.lat, coords.lng)
          : null;
      }
      setJobDistances(distMap);
      setFilteringByDistance(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobs, hasCoverage, coverage?.coverage_area, coverage?.coverage_lat, coverage?.coverage_lng]);

  useEffect(() => {
    const unsubscribe = base44.entities.Job.subscribe((event) => {
      // Invalidate all jobs queries regardless of filters/parameters
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "jobs"
      });
    });
    return unsubscribe;
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = base44.entities.Booking.subscribe((event) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "jobs"
      });
    });
    return unsubscribe;
  }, [queryClient]);

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
      const msg = err?.data?.error || err?.message || '';
      if (msg.includes('shirt & jacket') || err?.data?.code === 'APPAREL_REQUIRED') {
        setShowApparelRequired(true);
      } else {
        alert(msg || 'Booking failed');
      }
    },
    onSuccess: () => {
      setBookingJob(null);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setTimeout(() => {
        navigate(createPageUrl("MediaPartnerDashboard"));
      }, 100);
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
      const errorMsg = error.response?.data?.error || error.message;
      alert(errorMsg);
      if (context?.previousJobs) {
        queryClient.setQueryData(["jobs", filter, user?.email], context.previousJobs);
      }
      setCancelDialogOpen(false);
      setCancelJob(null);
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
    if (apparelBlocked) {
      setShowApparelRequired(true);
      return;
    }
    setBookingJob(job);
  };

  const confirmBooking = async () => {
    if (!bookingJob) return;

    const storedEmail = localStorage.getItem('user_email');
    const storedName = localStorage.getItem('user_name');
    const storedPhone = localStorage.getItem('user_phone');
    const email = user?.email || storedEmail;
    const name = user?.full_name || storedName;
    const phone = user?.phone || storedPhone;

    if (!email || !name) {
      alert("User data not available. Please refresh the page.");
      return;
    }

    const jobData = {
      status: "booked",
      booked_by: email,
      booked_by_name: name,
      booked_by_phone: phone,
    };

    const bgStatus = user?.background_check_status;
    if (bgStatus === "pending") {
      setBgPendingOpen(true);
      return;
    }
    if (bgStatus === "failed") {
      setBgFailedOpen(true);
      return;
    }
    if (bgStatus !== "clear") {
      setBgAuthContext({ jobId: bookingJob.id, jobData, mediaPartnerEmail: email, bookJob: true });
      setBgAuthOpen(true);
      setBookingJob(null);
      return;
    }

    bookMutation.mutate({
      id: bookingJob.id,
      data: jobData,
      mediaPartnerEmail: email,
    });
  };

  const handleBgAuthorized = (data) => {
    setBgAuthOpen(false);
    setBgAuthContext(null);
    queryClient.invalidateQueries({ queryKey: ["user"] });
    if (data?.invitation_url) {
      navigate(createPageUrl("BackgroundCheck"), { state: { invitationUrl: data.invitation_url } });
    } else if (data?.manual) {
      navigate(createPageUrl("BackgroundCheck"), { state: { manual: true } });
    } else {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      navigate(createPageUrl("MediaPartnerDashboard"));
    }
  };

  const handleCompleteBackgroundCheck = (job) => {
    const storedEmail = localStorage.getItem('user_email');
    const email = user?.email || storedEmail;
    setBgAuthContext({ jobId: job.id, mediaPartnerEmail: email, bookJob: false });
    setBgAuthOpen(true);
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
   })
   .filter((job) => {
     if (!hasCoverage) return true;
     const d = jobDistances[job.id];
     return d != null && d <= maxDistance;
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
                {filteringByDistance
                  ? "Filtering gigs by your coverage area..."
                  : searchQuery
                  ? "No jobs match your search."
                  : hasCoverage
                  ? "No gigs available within your coverage area. Try increasing your travel distance in your dashboard."
                  : "No jobs available at the moment."}
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
                  backgroundCheckStatus={user?.background_check_status}
                  onCompleteBackgroundCheck={handleCompleteBackgroundCheck}
                  onJobUpdate={() => queryClient.invalidateQueries({ queryKey: ["jobs"] })}
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

        <Dialog open={showApparelRequired} onOpenChange={setShowApparelRequired}>
          <DialogContent className="border-2 border-[#B8956A]/30">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Shirt &amp; Jacket Required</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                You can accept up to 2 jobs without purchasing your shirt &amp; jacket. To accept more jobs, please purchase your apparel ($50) — pay out of pocket or have it come out of your balance.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApparelRequired(false)} className="border-[#1A1A1A]/20">
                Maybe Later
              </Button>
              <Button onClick={() => navigate(createPageUrl("PurchaseApparel"))} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                Purchase Shirt &amp; Jacket
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

        <BackgroundCheckAuthorizationModal
          open={bgAuthOpen}
          onOpenChange={setBgAuthOpen}
          context={bgAuthContext}
          onAuthorized={handleBgAuthorized}
        />

        <Dialog open={bgPendingOpen} onOpenChange={setBgPendingOpen}>
          <DialogContent className="border-2 border-[#B8956A]/30">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Background Check In Progress</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                Your background check is already in progress. You'll be able to book new gigs once it clears. You can finish your background check any time.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBgPendingOpen(false)} className="border-[#1A1A1A]/20">Close</Button>
              <Button onClick={() => { setBgPendingOpen(false); navigate(createPageUrl("BackgroundCheck"), { state: {} }); }} className="bg-[#B8956A] hover:bg-[#A68559] text-white">Resume Background Check</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bgFailedOpen} onOpenChange={setBgFailedOpen}>
          <DialogContent className="border-2 border-[#B8956A]/30">
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Background Check Required</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                We weren't able to clear your background check. Please contact Arriv support to resolve this before booking gigs.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => setBgFailedOpen(false)} className="bg-[#B8956A] hover:bg-[#A68559] text-white">OK</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}