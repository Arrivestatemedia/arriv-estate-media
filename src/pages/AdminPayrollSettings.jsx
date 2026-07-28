import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert, CheckCircle2, AlertTriangle } from "lucide-react";

export default function AdminPayrollSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [endpoint, setEndpoint] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("managePayrollSettings", { action: "get" });
      const data = res.data;
      setSettings(data);
      setEndpoint(data.endpoint || "");
      setCompanyId(data.company_id || "");
      setEnabled(!!data.enabled);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await base44.functions.invoke("managePayrollSettings", {
        action: "save",
        endpoint,
        company_id: companyId,
        enabled,
      });
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Arriv Payroll Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Arriv One is the system of record for sales activity and commission approval. Arriv Payroll is the system of
          record for payroll calculations, taxes, pay statements, payments and filings.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Configure how Arriv One talks to Arriv Payroll. The API secret and webhook signing secret are stored as
            backend secrets in dashboard Settings → Environment Variables and are never exposed to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="endpoint">Arriv Payroll API endpoint</Label>
            <Input
              id="endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://arriv-pay-core.base44.app"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company identifier</Label>
            <Input
              id="company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="arriv"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2">
                {settings?.has_api_secret ? (
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-medium">API signing secret</p>
                  <p className="text-xs text-muted-foreground">ARRIV_PAYROLL_API_SECRET</p>
                </div>
              </div>
              <Badge variant={settings?.has_api_secret ? "default" : "secondary"}>
                {settings?.has_api_secret ? "Configured" : "Missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2">
                {settings?.has_webhook_secret ? (
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-medium">Webhook signing secret</p>
                  <p className="text-xs text-muted-foreground">ARRIV_PAYROLL_WEBHOOK_SECRET</p>
                </div>
              </div>
              <Badge variant={settings?.has_webhook_secret ? "default" : "secondary"}>
                {settings?.has_webhook_secret ? "Configured" : "Missing"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Integration enabled</p>
              <p className="text-xs text-muted-foreground">
                When disabled, compensation cannot be sent to Arriv Payroll.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save settings
            </Button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Synchronization status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last successful synchronization</span>
            <span className="font-medium">
              {settings?.last_sync_at ? new Date(settings.last_sync_at).toLocaleString() : "Never"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last synchronization error</span>
            <span className={`font-medium ${settings?.last_sync_error ? "text-destructive" : ""}`}>
              {settings?.last_sync_error || "None"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound webhook</CardTitle>
          <CardDescription>
            Point Arriv Payroll's status callbacks here. Each request must be HMAC-SHA256 signed with the webhook
            secret and sent as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-muted-foreground">Endpoint</span>
            <code className="text-xs">
              POST {(endpoint || "<endpoint>").replace(/\/functions\/.*$/i, "").replace(/\/$/, "")}/functions/receivePayrollStatus
            </code>
          </div>
          <p className="text-xs text-muted-foreground">
            Payload: compensation_import_id, source_record_id, payroll_status (accepted | scheduled | processed |
            paid | voided | corrected | rejected), pay_period_id, pay_date, payment_reference, net_pay, timestamp.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}