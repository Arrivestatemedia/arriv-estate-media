import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Calendar, DollarSign } from "lucide-react";

export default function EarningsBreakdown({ jobs, payoutHistory }) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Calculate start of pay period (last Friday at 4am)
  const getPayPeriodStart = () => {
    const d = new Date();
    const currentDay = d.getDay(); // 0 = Sunday, 5 = Friday
    const lastFridayDate = d.getDate() - ((currentDay + 2) % 7);
    const lastFriday = new Date(d.getFullYear(), d.getMonth(), lastFridayDate);
    lastFriday.setHours(4, 0, 0, 0);
    return lastFriday;
  };
  
  const startOfPayPeriod = getPayPeriodStart();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Calculate earnings from completed jobs
  const completedJobs = jobs.filter(j => j.status === 'completed');
  
  const todayEarnings = completedJobs
    .filter(j => new Date(j.updated_date || j.date) >= today)
    .reduce((sum, j) => sum + (j.pay_rate || 0), 0);

  const weekEarnings = completedJobs
    .filter(j => new Date(j.updated_date || j.date) >= startOfWeek)
    .reduce((sum, j) => sum + (j.pay_rate || 0), 0);

  const monthEarnings = completedJobs
    .filter(j => new Date(j.updated_date || j.date) >= startOfMonth)
    .reduce((sum, j) => sum + (j.pay_rate || 0), 0);

  const yearEarnings = completedJobs
    .filter(j => new Date(j.updated_date || j.date) >= startOfYear)
    .reduce((sum, j) => sum + (j.pay_rate || 0), 0);

  // Also include payout history in yearly total
  const yearPayouts = payoutHistory
    .filter(p => new Date(p.payout_date) >= startOfYear)
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalYearEarnings = yearEarnings + yearPayouts;

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#B8956A]" />
          </div>
          <CardTitle className="text-[#1A1A1A]">Earnings Breakdown</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700 mb-1">Today</div>
            <div className="text-2xl font-bold text-blue-900">
              ${todayEarnings.toFixed(2)}
            </div>
          </div>
          
          <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
            <div className="text-sm text-green-700 mb-1">This Week</div>
            <div className="text-2xl font-bold text-green-900">
              ${weekEarnings.toFixed(2)}
            </div>
          </div>
          
          <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
            <div className="text-sm text-purple-700 mb-1">This Month</div>
            <div className="text-2xl font-bold text-purple-900">
              ${monthEarnings.toFixed(2)}
            </div>
          </div>
          
          <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
            <div className="text-sm text-amber-700 mb-1">This Year</div>
            <div className="text-2xl font-bold text-amber-900">
              ${totalYearEarnings.toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}