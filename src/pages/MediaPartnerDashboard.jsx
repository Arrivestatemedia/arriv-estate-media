import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Briefcase, DollarSign, TrendingUp, Calendar } from "lucide-react";
import PayoutSettings from "../components/mediapartner/PayoutSettings";
import PayoutMethodInfo from "../components/mediapartner/PayoutMethodInfo";
import PayoutHistoryList from "../components/mediapartner/PayoutHistoryList";
import BookedJobsList from "../components/mediapartner/BookedJobsList";
import EarningsBreakdown from "../components/mediapartner/EarningsBreakdown";
import PackageInfoDropdown from "../components/mediapartner/PackageInfoDropdown";
import PullToRefresh from "@/components/shared/PullToRefresh";

export default function MediaPartnerDashboard() {
  const [user, setUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const userName = localStorage.getItem('user_name');
    const userEmail = localStorage.getItem('user_email');
    
    if (userName && userEmail) {
      setUser({ full_name: userName, email: userEmail });
    } else {
      base44.auth.me().then(setUser);
    }
  }, []);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['media-partner-jobs', user?.email],
    queryFn: () => base44.entities.Job.filter({ 
      booked_by: user?.email,
      status: { $in: ['booked', 'in_progress', 'completed'] }
    }),
    enabled: !!user?.email,
  });

  const { data: payoutHistory = [] } = useQuery({
    queryKey: ['payout-history', user?.email],
    queryFn: () => base44.entities.PayoutHistory.filter({ 
      media_partner_email: user?.email 
    }, '-payout_date'),
    enabled: !!user?.email,
  });

  const { data: userRecord = null } = useQuery({
    queryKey: ['user-record', user?.email],
    queryFn: () => {
      if (!user?.email) return null;
      return base44.entities.PendingSignup.filter({ email: user.email }).then(results => results[0] || null);
    },
    enabled: !!user?.email,
  });

  const currentBalance = user?.current_balance || 0;
  const bookedJobs = jobs.filter(j => j.status === 'booked' || j.status === 'in_progress');
  const bookedJobsCount = bookedJobs.length;
  const bookedAmount = bookedJobs.reduce((sum, job) => sum + (job.pay_rate || 0), 0);
  const completedJobsCount = jobs.filter(j => j.status === 'completed').length;

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['media-partner-jobs', user?.email] }),
      queryClient.invalidateQueries({ queryKey: ['payout-history', user?.email] })
    ]);
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-[var(--bg-primary)] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Media Partner Dashboard</h1>
            <p className="text-[var(--text-secondary)] mt-1">Welcome back, {user?.full_name}</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
                  Current Balance
                </CardTitle>
                <DollarSign className="w-5 h-5 text-[var(--accent-color)]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[var(--text-primary)]">
                  ${currentBalance.toFixed(2)}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Pays out Friday at 4am
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
                  Booked Amount
                </CardTitle>
                <DollarSign className="w-5 h-5 text-[var(--accent-color)]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[var(--text-primary)]">
                  ${bookedAmount.toFixed(2)}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  From active jobs
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
                  Active Jobs
                </CardTitle>
                <Briefcase className="w-5 h-5 text-[var(--accent-color)]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[var(--text-primary)]">
                  {bookedJobsCount}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Currently booked or in progress
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border-color)] bg-[var(--card-bg)]">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-[var(--text-secondary)]">
                  Completed Jobs
                </CardTitle>
                <TrendingUp className="w-5 h-5 text-[var(--accent-color)]" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-[var(--text-primary)]">
                  {completedJobsCount}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  All time completed
                </p>
              </CardContent>
            </Card>
          </div>

        {/* Package Info */}
        <PackageInfoDropdown />

        {/* Earnings Breakdown */}
        <EarningsBreakdown jobs={jobs} payoutHistory={payoutHistory} />

        {/* Payout Settings */}
        <PayoutSettings user={user} />

        {/* Current Payout Method */}
        <PayoutMethodInfo user={userRecord} />

        {/* Payout History */}
        <PayoutHistoryList payoutHistory={payoutHistory} />

        {/* Booked Jobs */}
        <BookedJobsList jobs={jobs} loading={jobsLoading} />
        </div>
      </div>
    </PullToRefresh>
  );
}