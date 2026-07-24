import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, DollarSign, TrendingUp, Calendar, Zap, Clock } from "lucide-react";
import { createPageUrl } from "../utils";
import InstantPayoutDialog from "../components/mediapartner/InstantPayoutDialog";
import PayoutHistoryList from "../components/mediapartner/PayoutHistoryList";
import BookedJobsList from "../components/mediapartner/BookedJobsList";
import EarningsBreakdown from "../components/mediapartner/EarningsBreakdown";
import PackageInfoDropdown from "../components/mediapartner/PackageInfoDropdown";
import CoverageAreaSettings from "../components/mediapartner/CoverageAreaSettings";
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
      status: { $in: ['booked', 'in_progress', 'completed'] },
      from_booking: true
    }),
    enabled: !!user?.email,
  });

  useEffect(() => {
    const unsubscribe = base44.entities.Job.subscribe((event) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === 'media-partner-jobs'
      });
    });
    return unsubscribe;
  }, [queryClient]);

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

  // Calculate current balance from completed jobs this pay period
  const getPayPeriodStart = () => {
    const d = new Date();
    const currentDay = d.getDay(); // 0 = Sunday, 5 = Friday
    const lastFridayDate = d.getDate() - ((currentDay + 2) % 7);
    const lastFriday = new Date(d.getFullYear(), d.getMonth(), lastFridayDate);
    lastFriday.setHours(4, 0, 0, 0);
    return lastFriday;
  };

  const startOfPayPeriod = getPayPeriodStart();
  const now = new Date();
  const unpaidCompletedJobs = jobs.filter(j =>
    j.status === 'completed' &&
    new Date(j.completed_at) >= startOfPayPeriod &&
    !j.paid_out_at
  );
  const availableJobs = unpaidCompletedJobs.filter(j => !j.client_payment_clears_at || new Date(j.client_payment_clears_at) <= now);
  const pendingJobs = unpaidCompletedJobs.filter(j => j.client_payment_clears_at && new Date(j.client_payment_clears_at) > now);
  const availableBalance = availableJobs.reduce((sum, job) => sum + (job.pay_rate || 0), 0);
  const pendingBalance = pendingJobs.reduce((sum, job) => sum + (job.pay_rate || 0), 0);
  const currentBalance = availableBalance;
  const bookedJobs = jobs.filter(j => j.status === 'booked' || j.status === 'in_progress');
  const bookedJobsCount = bookedJobs.length;
  const bookedAmount = bookedJobs.reduce((sum, job) => sum + (job.pay_rate || 0), 0);
  const completedJobsCount = jobs.filter(j => j.status === 'completed').length;

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['media-partner-jobs', user?.email] }),
      queryClient.invalidateQueries({ queryKey: ['payout-history', user?.email] }),
      queryClient.invalidateQueries({ queryKey: ['user-record', user?.email] })
    ]);
  };

  const handlePayoutSave = () => {
    queryClient.invalidateQueries({ queryKey: ['user-record', user?.email] });
  };

  const [stripeOnboarding, setStripeOnboarding] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [instantPayoutOpen, setInstantPayoutOpen] = useState(false);

  const handleStripeOnboard = async () => {
    setStripeOnboarding(true);
    setStripeError("");
    try {
      const res = await base44.functions.invoke('stripeConnectOnboard', { email: user?.email });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setStripeError(res.data?.error || "Could not start Stripe onboarding. Please try again.");
      }
    } catch (e) {
      console.error('Stripe onboarding failed:', e);
      setStripeError(e.response?.data?.error || e.message || "Failed to start Stripe onboarding.");
    } finally {
      setStripeOnboarding(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_done') || params.get('stripe_refresh')) {
      queryClient.invalidateQueries({ queryKey: ['user-record', user?.email] });
    }
  }, [queryClient, user?.email]);

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
                  ${availableBalance.toFixed(2)}
                </div>
                {pendingBalance > 0 ? (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    +${pendingBalance.toFixed(2)} processing (1–2 business days)
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    Pays out Friday at 4am
                  </p>
                )}
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

        {/* Coverage Area Settings */}
        <CoverageAreaSettings />

        {/* Package Info */}
        <PackageInfoDropdown />

        {/* Earnings Breakdown */}
        <EarningsBreakdown jobs={jobs} payoutHistory={payoutHistory} />

        {/* Payout Method - Stripe Connect */}
        <Card className="border-[#B8956A]/20">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-[#B8956A]" />
              </div>
              <div>
                <CardTitle className="text-[#1A1A1A]">Payout Method</CardTitle>
                <CardDescription>Direct Deposit via Stripe</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={`flex items-center gap-2 text-sm ${userRecord?.stripe_payouts_enabled ? "text-green-700" : "text-amber-700"}`}>
              <span className={`w-2 h-2 rounded-full ${userRecord?.stripe_payouts_enabled ? "bg-green-500" : "bg-amber-500"}`} />
              {userRecord?.stripe_payouts_enabled
                ? "Payouts enabled — you're all set for automatic Friday payouts."
                : userRecord?.stripe_account_id
                  ? "Stripe setup incomplete — finish onboarding to receive payouts."
                  : "No payout account yet — set up direct deposit to get paid."}
            </div>
            <Button
              onClick={handleStripeOnboard}
              disabled={stripeOnboarding}
              className="bg-[#B8956A] hover:bg-[#A68559]"
            >
              {stripeOnboarding
                ? "Opening Stripe..."
                : userRecord?.stripe_payouts_enabled
                  ? "Update bank info"
                  : "Set up direct deposit"}
            </Button>
            {stripeError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {stripeError}
              </div>
            )}
            {userRecord?.stripe_payouts_enabled && (availableBalance > 0 || pendingBalance > 0) && (
              <Button
                variant="outline"
                onClick={() => availableBalance > 0 && setInstantPayoutOpen(true)}
                disabled={availableBalance <= 0}
                className="border-[#B8956A]/40 text-[#B8956A] hover:bg-[#B8956A]/10 disabled:opacity-60"
              >
                <Zap className="w-4 h-4 mr-2" />
                {availableBalance > 0
                  ? `Instant Payout · $${availableBalance.toFixed(2)}`
                  : `$${pendingBalance.toFixed(2)} processing…`}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Payout History */}
        <PayoutHistoryList payoutHistory={payoutHistory} />

        {/* Booked Jobs */}
        <BookedJobsList jobs={jobs} loading={jobsLoading} />
        </div>

      <InstantPayoutDialog
        open={instantPayoutOpen}
        onClose={() => setInstantPayoutOpen(false)}
        balance={availableBalance}
        onSuccess={handleRefresh}
      />
      </div>
    </PullToRefresh>
  );
}