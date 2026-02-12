import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export default function NewJobsBadge() {
  const [newJobsCount, setNewJobsCount] = useState(0);

  useEffect(() => {
    const fetchNewJobsCount = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) return;

        const user = await base44.auth.me();
        if (user?.user_type !== 'contractor') return;

        // Get all open jobs
        const allJobs = await base44.entities.Job.filter({ status: 'open' });
        
        if (!user.last_viewed_jobs_at) {
          // If they've never viewed, all jobs are new
          setNewJobsCount(allJobs.length);
          return;
        }

        // Count jobs created after last viewed timestamp
        const lastViewed = new Date(user.last_viewed_jobs_at);
        const newJobs = allJobs.filter(job => new Date(job.created_date) > lastViewed);
        setNewJobsCount(newJobs.length);
      } catch (error) {
        console.error('Error fetching new jobs count:', error);
      }
    };

    fetchNewJobsCount();

    // Subscribe to Job changes to update badge in real-time
    const unsubscribe = base44.entities.Job.subscribe((event) => {
      if (event.type === 'create' && event.data?.status === 'open') {
        fetchNewJobsCount();
      }
    });

    return unsubscribe;
  }, []);

  if (newJobsCount === 0) return null;

  return (
    <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full min-w-[18px]">
      {newJobsCount > 9 ? '9+' : newJobsCount}
    </span>
  );
}