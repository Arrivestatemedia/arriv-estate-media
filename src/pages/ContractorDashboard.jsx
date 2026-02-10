import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Briefcase, DollarSign, TrendingUp, Calendar } from "lucide-react";
import PayoutSettings from "../components/contractor/PayoutSettings";
import PayoutHistoryList from "../components/contractor/PayoutHistoryList";
import BookedJobsList from "../components/contractor/BookedJobsList";
import EarningsBreakdown from "../components/contractor/EarningsBreakdown";

export default function ContractorDashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['contractor-jobs', user?.email],
    queryFn: () => base44.entities.Job.filter({ 
      booked_by: user?.email,
      status: { $in: ['booked', 'in_progress', 'completed'] }
    }),
    enabled: !!user?.email,
  });

  const { data: payoutHistory = [] } = useQuery({
    queryKey: ['payout-history', user?.email],
    queryFn: () => base44.entities.PayoutHistory.filter({ 
      contractor_email: user?.email 
    }, '-payout_date'),
    enabled: !!user?.email,
  });

  const currentBalance = user?.current_balance || 0;
  const bookedJobsCount = jobs.filter(j => j.status === 'booked' || j.status === 'in_progress').length;
  const completedJobsCount = jobs.filter(j => j.status === 'completed').length;

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1A1A1A]">Contractor Dashboard</h1>
          <p className="text-[#1A1A1A]/60 mt-1">Welcome back, {user?.full_name}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-[#B8956A]/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[#1A1A1A]/70">
                Current Balance
              </CardTitle>
              <DollarSign className="w-5 h-5 text-[#B8956A]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#1A1A1A]">
                ${currentBalance.toFixed(2)}
              </div>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Pays out Friday at 4am
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#B8956A]/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[#1A1A1A]/70">
                Active Jobs
              </CardTitle>
              <Briefcase className="w-5 h-5 text-[#B8956A]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#1A1A1A]">
                {bookedJobsCount}
              </div>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Currently booked or in progress
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#B8956A]/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-[#1A1A1A]/70">
                Completed Jobs
              </CardTitle>
              <TrendingUp className="w-5 h-5 text-[#B8956A]" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-[#1A1A1A]">
                {completedJobsCount}
              </div>
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                All time completed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Breakdown */}
        <EarningsBreakdown jobs={jobs} payoutHistory={payoutHistory} />

        {/* Payout Settings */}
        <PayoutSettings user={user} />

        {/* Payout History */}
        <PayoutHistoryList payoutHistory={payoutHistory} />

        {/* Booked Jobs */}
        <BookedJobsList jobs={jobs} loading={jobsLoading} />
      </div>
    </div>
  );
}