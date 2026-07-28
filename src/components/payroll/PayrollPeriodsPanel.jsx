import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Send, RefreshCw, Landmark, AlertTriangle } from "lucide-react";

const periodStatusVariant = (status) => {
  switch (status) {
    case "completed":
    case "payroll_validated":
      return "default";
    case "locked":
    case "submitted_to_payroll":
      return "secondary";
    case "correction_required":
    case "payroll_rejected":
      return "destructive";
    default:
      return "outline";
  }
};

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function PayrollPeriodsPanel({ onNeedsReview }) {
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.entities.PayrollPeriod.list("-period_start_date", 50);
      setPeriods(res || []);
      if (onNeedsReview) {
        const needs = (res || []).some((p) => p.status === "correction_required");
        onNeedsReview(needs);
      }
    } catch (e) {
      setError(e?.message || "Failed to load pay periods");
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn, period) => {
    setActingId(period.id);
    setError("");
    try {
      await base44.functions.invoke(fn, { pay_period_id: period.pay_period_id });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Action failed");
    } finally {
      setActingId(null);
    }
  };

  const canLock = (p) =>
    ["upcoming", "collecting", "cutoff_reached", "ready_to_lock", "preparing"].includes(p.status);
  const canSubmit = (p) => p.status === "locked";
  const needsReview = (p) => p.status === "correction_required";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4" /> Biweekly pay periods
          </CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 mb-3 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pay periods created yet.</p>
        ) : (
          <div className="space-y-2">
            {periods.map((p) => (
              <div
                key={p.id}
                className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {fmtDate(p.period_start_date)} → {fmtDate(p.period_end_date)}
                    </span>
                    <Badge variant={periodStatusVariant(p.status)}>{p.status}</Badge>
                    {p.version > 1 && <Badge variant="outline">v{p.version}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.employee_count || 0} employees · {p.source_record_count || 0} source records ·
                    expected {fmtMoney(p.expected_gross_commission_total)}
                    {p.status === "payroll_validated" || p.status === "correction_required"
                      ? ` · confirmed ${fmtMoney(p.payroll_confirmed_gross_total)} · variance ${fmtMoney(p.variance)}`
                      : ""}
                    {p.scheduled_payment_date ? ` · pays ${fmtDate(p.scheduled_payment_date)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canLock(p) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act("lockPayrollPeriod", p)}
                      disabled={actingId === p.id}
                    >
                      {actingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Lock className="w-3.5 h-3.5" />
                      )}
                      Lock
                    </Button>
                  )}
                  {canSubmit(p) && (
                    <Button
                      size="sm"
                      onClick={() => act("sendPayrollSubmission", p)}
                      disabled={actingId === p.id}
                    >
                      {actingId === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Submit
                    </Button>
                  )}
                  {needsReview(p) && (
                    <Button size="sm" variant="destructive" onClick={() => act("lockPayrollPeriod", p)} disabled>
                      Needs review
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}