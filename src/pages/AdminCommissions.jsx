import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Eye,
} from "lucide-react";

const approvalVariant = (s) =>
  s === "owner_approved" ? "default" : s === "manager_reviewed" ? "secondary" : "outline";

const payrollVariant = (s) => {
  switch (s) {
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

const COMP_TYPES = ["commission", "bonus", "spiff", "override", "draw"];

export default function AdminCommissions() {
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [me, setMe] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    employee_id: "",
    compensation_type: "commission",
    commission_plan_id: "",
    deal_id: "",
    customer_name: "",
    description: "",
    gross_amount: "",
    earned_date: "",
    intended_pay_period: "",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, empRes, user] = await Promise.all([
        base44.entities.Commission.list("-updated_date", 200),
        base44.functions.invoke("managePayrollSettings", { action: "list_employees" }),
        base44.auth.me().catch(() => null),
      ]);
      setCommissions(list || []);
      setEmployees(empRes?.data?.employees || []);
      setMe(user);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === form.employee_id),
    [employees, form.employee_id]
  );

  const handleCreate = async () => {
    if (!form.employee_id || !form.gross_amount || !form.earned_date) {
      setError("Employee, gross amount and earned date are required.");
      return;
    }
    setActionId("create");
    setError("");
    try {
      await base44.entities.Commission.create({
        employee_id: form.employee_id,
        employee_email: selectedEmployee?.email || "",
        employee_name: selectedEmployee?.full_name || "",
        payroll_employee_id: selectedEmployee?.payroll_employee_id || "",
        compensation_type: form.compensation_type,
        commission_plan_id: form.commission_plan_id,
        deal_id: form.deal_id,
        customer_name: form.customer_name,
        description: form.description,
        gross_amount: Number(form.gross_amount),
        earned_date: form.earned_date,
        intended_pay_period: form.intended_pay_period,
        approval_status: "pending",
        payroll_status: "not_sent",
        compensation_version: 1,
      });
      setForm({
        employee_id: "",
        compensation_type: "commission",
        commission_plan_id: "",
        deal_id: "",
        customer_name: "",
        description: "",
        gross_amount: "",
        earned_date: "",
        intended_pay_period: "",
      });
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to create commission");
    } finally {
      setActionId(null);
    }
  };

  const advanceApproval = async (c) => {
    const next = c.approval_status === "pending" ? "manager_reviewed" : "manager_reviewed" === c.approval_status ? "owner_approved" : null;
    if (!next) return;
    setActionId(c.id);
    setError("");
    try {
      const update = { approval_status: next };
      const now = new Date().toISOString();
      const by = me?.full_name || "admin";
      if (next === "manager_reviewed") {
        update.manager_reviewed_at = now;
        update.manager_reviewed_by = by;
      } else {
        update.owner_approved_at = now;
        update.owner_approved_by = by;
        update.approved_date = new Date().toISOString().slice(0, 10);
      }
      await base44.entities.Commission.update(c.id, update);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to update");
    } finally {
      setActionId(null);
    }
  };

  const sendToPayroll = async (c) => {
    setSendingId(c.id);
    setError("");
    try {
      const res = await base44.functions.invoke("sendApprovedCompensationToPayroll", { commission_id: c.id });
      if (res?.data?.error) setError(res.data.error);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to send to payroll");
    } finally {
      setSendingId(null);
    }
  };

  const canSend = (c) =>
    c.approval_status === "owner_approved" &&
    ["not_sent", "failed", "rejected"].includes(c.payroll_status);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Commissions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Approve compensation, then send owner-approved records to Arriv Payroll.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowForm((s) => !s)}>
            <Plus className="w-4 h-4 mr-2" /> New commission
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>New commission</CardTitle>
            <CardDescription>Arriv One records gross compensation only — no withholding or net pay.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Employee</Label>
              <select
                className="w-full rounded-md border border-input bg-background h-11 md:h-9 px-3 text-sm"
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.email}){e.payroll_employee_id ? ` · ${e.payroll_employee_id}` : ""}
                  </option>
                ))}
              </select>
              {selectedEmployee && !selectedEmployee.payroll_employee_id && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> This employee has no payroll_employee_id mapped.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Compensation type</Label>
              <select
                className="w-full rounded-md border border-input bg-background h-11 md:h-9 px-3 text-sm"
                value={form.compensation_type}
                onChange={(e) => setForm({ ...form, compensation_type: e.target.value })}
              >
                {COMP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Gross amount (USD)</Label>
              <Input
                type="number"
                value={form.gross_amount}
                onChange={(e) => setForm({ ...form, gross_amount: e.target.value })}
                placeholder="750.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Earned date</Label>
              <Input
                type="date"
                value={form.earned_date}
                onChange={(e) => setForm({ ...form, earned_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Intended pay period</Label>
              <Input
                value={form.intended_pay_period}
                onChange={(e) => setForm({ ...form, intended_pay_period: e.target.value })}
                placeholder="2026-08"
              />
            </div>
            <div className="space-y-2">
              <Label>Commission plan ID</Label>
              <Input
                value={form.commission_plan_id}
                onChange={(e) => setForm({ ...form, commission_plan_id: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Deal ID</Label>
              <Input value={form.deal_id} onChange={(e) => setForm({ ...form, deal_id: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Customer name</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={handleCreate} disabled={actionId === "create"}>
                {actionId === "create" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create as pending
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : commissions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No commission records yet. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {commissions.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {c.employee_name || c.employee_email || "—"}
                        {c.payroll_employee_id ? (
                          <span className="text-xs text-muted-foreground ml-2">· {c.payroll_employee_id}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {c.description || c.compensation_type} · ${Number(c.gross_amount || 0).toFixed(2)} · earned{" "}
                        {c.earned_date || "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Badge variant={approvalVariant(c.approval_status)}>{c.approval_status}</Badge>
                      <Badge variant={payrollVariant(c.payroll_status)}>{c.payroll_status}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Pay period</p>
                      <p className="font-medium truncate">{c.payroll_pay_period_id || c.intended_pay_period || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Scheduled pay date</p>
                      <p className="font-medium">{c.scheduled_pay_date || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment status</p>
                      <p className="font-medium truncate">
                        {c.payment_reference ? `ref ${c.payment_reference}` : c.payroll_status}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Net pay</p>
                      <p className="font-medium">
                        {typeof c.net_pay === "number" ? `$${c.net_pay.toFixed(2)}` : "—"}
                      </p>
                    </div>
                  </div>

                  {c.payroll_sync_error && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span className="break-words">{c.payroll_sync_error}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {c.approval_status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => advanceApproval(c)} disabled={actionId === c.id}>
                        <Eye className="w-4 h-4 mr-1.5" /> Manager review
                      </Button>
                    )}
                    {c.approval_status === "manager_reviewed" && (
                      <Button size="sm" variant="outline" onClick={() => advanceApproval(c)} disabled={actionId === c.id}>
                        <ShieldCheck className="w-4 h-4 mr-1.5" /> Owner approve
                      </Button>
                    )}
                    {canSend(c) && (
                      <Button size="sm" onClick={() => sendToPayroll(c)} disabled={sendingId === c.id}>
                        {sendingId === c.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                        ) : c.payroll_status === "failed" || c.payroll_status === "rejected" ? (
                          <RefreshCw className="w-4 h-4 mr-1.5" />
                        ) : (
                          <Send className="w-4 h-4 mr-1.5" />
                        )}
                        {c.payroll_status === "failed" || c.payroll_status === "rejected" ? "Retry" : "Send to payroll"}
                      </Button>
                    )}
                    {c.payroll_status === "accepted" && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Accepted by payroll
                      </span>
                    )}
                    {c.payroll_compensation_import_id && (
                      <span className="text-xs text-muted-foreground">
                        import: {c.payroll_compensation_import_id}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}