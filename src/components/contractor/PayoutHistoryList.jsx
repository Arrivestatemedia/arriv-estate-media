import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { History, DollarSign, Calendar, Clock } from "lucide-react";
import { format, addDays, nextFriday } from "date-fns";

export default function PayoutHistoryList({ payoutHistory }) {
  const getNextPayoutDate = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    
    // If it's Friday and before 4am, payout is today
    if (dayOfWeek === 5 && now.getHours() < 4) {
      return now;
    }
    
    // Otherwise, get next Friday
    return nextFriday(now);
  };

  const nextPayout = getNextPayoutDate();
  if (!payoutHistory || payoutHistory.length === 0) {
    return (
      <Card className="border-[#B8956A]/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <History className="w-5 h-5 text-[#B8956A]" />
            </div>
            <CardTitle className="text-[#1A1A1A]">Payout History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="bg-blue-50 border-blue-200 mb-4">
            <Clock className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-sm text-blue-900">
              <strong>Next payout:</strong> {format(nextPayout, 'EEEE, MMMM d, yyyy')} at 4:00 AM
            </AlertDescription>
          </Alert>
          <p className="text-[#1A1A1A]/60 text-center py-8">
            No payout history yet. Your first payout will occur on the next Friday at 4am.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <History className="w-5 h-5 text-[#B8956A]" />
          </div>
          <CardTitle className="text-[#1A1A1A]">Payout History</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Alert className="bg-blue-50 border-blue-200 mb-4">
          <Clock className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-900">
            <strong>Next payout:</strong> {format(nextPayout, 'EEEE, MMMM d, yyyy')} at 4:00 AM
          </AlertDescription>
        </Alert>
        <div className="space-y-3">
          {payoutHistory.map((payout) => (
            <div
              key={payout.id}
              className="flex items-center justify-between p-4 bg-white rounded-lg border border-[#B8956A]/10 hover:border-[#B8956A]/30 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="font-semibold text-[#1A1A1A]">
                    ${payout.amount.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(payout.payout_date), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <Badge
                  variant={payout.status === 'completed' ? 'default' : 'secondary'}
                  className={payout.status === 'completed' ? 'bg-green-100 text-green-800' : ''}
                >
                  {payout.status}
                </Badge>
                <div className="text-xs text-[#1A1A1A]/60 mt-1">
                  {payout.payout_method === 'zelle' ? (
                    <>Zelle: {payout.payout_destination}</>
                  ) : (
                    <>Bank: ****{payout.payout_destination}</>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}