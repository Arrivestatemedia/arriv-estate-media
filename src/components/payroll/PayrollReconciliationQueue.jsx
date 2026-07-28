import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function PayrollReconciliationQueue({ hasNeeds }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.entities.PayrollReconciliation.list("-response_timestamp", 100);
      setRecords(res || []);
    } catch (e) {
      setError(e?.message || "Failed to load reconciliations");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const review = async (rec) => {
    setActingId(rec.id);
    setError("");
    try {
      await base44.functions.invoke("reviewPayrollReconciliation", {
        reconciliation_id: rec.reconciliation_id,
        resolution_notes: notes[rec.id] || "",
      });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Review failed");
    } finally {
      setActingId(null);
    }
  };

  const mismatched = records.filter((r) => r.validation_status === "mismatched");
  const matched = records.filter((r) => r.validation_status === "matched");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Reconciliation queue
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
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reconciliations received from Arriv Payroll yet.</p>
        ) : (
          <div className="space-y-3">
            {mismatched.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                <p className="text-xs font-medium text-destructive">
                  {mismatched.length} mismatched — variance beyond ${mismatched[0]?.rounding_tolerance?.toFixed(2) || "0.01"} tolerance
                </p>
                {mismatched.map((r) => (
                  <div key={r.id} className="rounded-md border bg-background p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.arriv_employee_id} · {r.pay_period_id} (v{r.payroll_version})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          submitted {fmtMoney(r.arriv_one_submitted_gross)} · recalculated {fmtMoney(r.payroll_recalculated_gross)} · variance{" "}
                          <span className="text-destructive font-medium">{fmtMoney(r.variance)}</span>
                          {r.received_source_record_count ? ` · ${r.received_source_record_count} records` : ""}
                        </p>
                        {r.validation_errors?.length > 0 && (
                          <p className="text-xs text-destructive mt-0.5">{r.validation_errors.join("; ")}</p>
                        )}
                      </div>
                      <Badge variant="destructive">mismatched</Badge>
                    </div>
                    {r.reviewed_at ? (
                      <p className="text-xs text-muted-foreground">
                        Reviewed by {r.reviewed_by} on {new Date(r.reviewed_at).toLocaleString()}
                        {r.resolution_notes ? ` — ${r.resolution_notes}` : ""}
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Textarea
                          placeholder="Resolution notes…"
                          value={notes[r.id] || ""}
                          onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                          className="text-xs min-h-[2.5rem]"
                        />
                        <Button
                          size="sm"
                          onClick={() => review(r)}
                          disabled={actingId === r.id}
                          className="shrink-0"
                        >
                          {actingId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Mark reviewed
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {matched.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{matched.length} matched</p>
                {matched.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">
                      {r.arriv_employee_id} · {r.pay_period_id} (v{r.payroll_version})
                    </span>
                    <span className="text-muted-foreground">
                      {fmtMoney(r.arriv_one_submitted_gross)} · var {fmtMoney(r.variance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}