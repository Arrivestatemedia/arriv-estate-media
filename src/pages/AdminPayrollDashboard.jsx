import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, CalendarClock, Wallet, Send } from "lucide-react";
import PayrollPeriodsPanel from "@/components/payroll/PayrollPeriodsPanel";
import PayrollReconciliationQueue from "@/components/payroll/PayrollReconciliationQueue";

const payrollStatusVariant = (status) => {
  switch (status) {
    case "paid":
    case "processed":
      return "default";
    case "accepted":
    case "scheduled":
      return "secondary";
    case "failed":
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
};

function CommissionRow({ c }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{c.employee_name || c.employee_email || "—"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {c.description || c.compensation_type} · ${Number(c.gross_amount || 0).toFixed(2)}
          {c.payroll_compensation_import_id ? ` · ${c.payroll_compensation_import_id}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={payrollStatusVariant(c.payroll_status)}>{c.payroll_status}</Badge>
        {c.payroll_sync_error && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
      </div>
    </div>
  );
}

export default function AdminPayrollDashboard() {
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState([]);
  const [needsReview, setNeedsReview] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.entities.Commission.list("-updated_date", 200);
      setCommissions(res || []);
    } catch (e) {
      setCommissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const approvedUnsent = commissions.filter(
      (c) =>
        c.approval_status === "owner_approved" &&
        ["not_sent", "failed", "rejected", "sending"].includes(c.payroll_status)
    );
    const failedSync = commissions.filter(
      (c) => c.payroll_status === "failed" || c.payroll_status === "rejected"
    );
    const accepted = commissions.filter((c) => c.payroll_status === "accepted");
    const scheduled = commissions.filter(
      (c) => c.payroll_status === "scheduled" || c.payroll_status === "processed"
    );
    const recentlyPaid = commissions
      .filter((c) => c.payroll_status === "paid")
      .sort((a, b) => new Date(b.payroll_last_synced_at || 0) - new Date(a.payroll_last_synced_at || 0))
      .slice(0, 10);
    return { approvedUnsent, failedSync, accepted, scheduled, recentlyPaid };
  }, [commissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll Integration Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compensation approved in Arriv One, synchronized with Arriv Payroll.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Link to={createPageUrl("AdminCommissions")}>
            <Button size="sm">
              <Send className="w-4 h-4 mr-2" /> Manage commissions
            </Button>
          </Link>
        </div>
      </div>

      <PayrollPeriodsPanel onNeedsReview={setNeedsReview} />
      <PayrollReconciliationQueue hasNeeds={needsReview} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved but unsent</CardTitle>
            <Wallet className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups.approvedUnsent.length}</div>
            <div className="mt-2 max-h-40 overflow-auto">
              {groups.approvedUnsent.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing waiting to be sent.</p>
              ) : (
                groups.approvedUnsent.slice(0, 8).map((c) => <CommissionRow key={c.id} c={c} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed synchronization</CardTitle>
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{groups.failedSync.length}</div>
            <div className="mt-2 max-h-40 overflow-auto">
              {groups.failedSync.length === 0 ? (
                <p className="text-xs text-muted-foreground">No failed attempts.</p>
              ) : (
                groups.failedSync.slice(0, 8).map((c) => <CommissionRow key={c.id} c={c} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted by payroll</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups.accepted.length}</div>
            <div className="mt-2 max-h-40 overflow-auto">
              {groups.accepted.length === 0 ? (
                <p className="text-xs text-muted-foreground">None accepted yet.</p>
              ) : (
                groups.accepted.slice(0, 8).map((c) => <CommissionRow key={c.id} c={c} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled payroll</CardTitle>
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groups.scheduled.length}</div>
            <div className="mt-2 max-h-40 overflow-auto">
              {groups.scheduled.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
              ) : (
                groups.scheduled.slice(0, 8).map((c) => <CommissionRow key={c.id} c={c} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently paid compensation</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.recentlyPaid.length === 0 ? (
            <p className="text-sm text-muted-foreground">No paid compensation yet.</p>
          ) : (
            <div className="divide-y">
              {groups.recentlyPaid.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{c.employee_name || c.employee_email}</p>
                    <p className="text-xs text-muted-foreground">
                      ${Number(c.gross_amount || 0).toFixed(2)}
                      {c.scheduled_pay_date ? ` · paid ${c.scheduled_pay_date}` : ""}
                      {c.payment_reference ? ` · ref ${c.payment_reference}` : ""}
                      {typeof c.net_pay === "number" ? ` · net $${c.net_pay.toFixed(2)}` : ""}
                    </p>
                  </div>
                  <Badge variant="default">paid</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}