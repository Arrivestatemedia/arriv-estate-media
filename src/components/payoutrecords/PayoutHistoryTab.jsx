import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { History, Calendar, DollarSign } from "lucide-react";

export default function PayoutHistoryTab() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchPayouts = async () => {
    setLoading(true);
    setError("");
    try {
      const params = { action: "get_payout_history" };
      if (yearFilter) params.year = parseInt(yearFilter);
      if (monthFilter) params.month = parseInt(monthFilter);
      if (statusFilter) params.status = statusFilter;
      const res = await base44.functions.invoke("getPayoutRecords", params);
      if (res.data?.payouts) setPayouts(res.data.payouts);
      else setError(res.data?.error || "Could not load payout history.");
    } catch (e) {
      setError(e.message || "Could not load payout history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayouts(); }, [yearFilter, monthFilter, statusFilter]);

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i).toLocaleString("en-US", { month: "long" }) }));

  return (
    <div className="space-y-4">
      <Card className="border-[#B8956A]/20 bg-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <History className="w-5 h-5 text-[#B8956A]" />
            </div>
            <CardTitle className="text-[#1A1A1A]">Payout History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px] border-[#B8956A]/30"><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-[140px] border-[#B8956A]/30"><SelectValue placeholder="All Months" /></SelectTrigger>
              <SelectContent>
                {months.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] border-[#B8956A]/30"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            {(yearFilter || monthFilter || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setYearFilter(""); setMonthFilter(""); setStatusFilter(""); }} className="text-[#B8956A]">
                Clear
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/60 text-center py-8">No payouts match your filters.</p>
          ) : (
            <div className="space-y-3">
              {payouts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-[#FFFBF5] rounded-lg border border-[#B8956A]/10 hover:border-[#B8956A]/30 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-[#B8956A]" />
                    </div>
                    <div>
                      <div className="font-semibold text-[#1A1A1A]">${(p.amount || 0).toFixed(2)}</div>
                      <div className="flex items-center gap-2 text-sm text-[#1A1A1A]/60">
                        <Calendar className="w-3 h-3" />
                        {new Date(p.payout_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={p.status === "completed" ? "default" : "secondary"} className={p.status === "completed" ? "bg-amber-100 text-amber-800" : "bg-orange-100 text-orange-800"}>
                      {p.status}
                    </Badge>
                    <div className="text-xs text-[#1A1A1A]/60 mt-1">
                      {p.payout_method === "stripe_connect" ? "Stripe Connect" : p.payout_method === "zelle" ? `Zelle: ${p.payout_destination}` : `Bank: ****${p.payout_destination}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}