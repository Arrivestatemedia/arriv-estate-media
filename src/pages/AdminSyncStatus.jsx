import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock, ArrowRight, Activity, Database, Zap, FileText, Shield, FlaskConical, ClipboardCheck } from "lucide-react";

export default function AdminSyncStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [validation, setValidation] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getEstateMediaSyncStatus", {});
      setStatus(res.data);
    } catch (e) {
      setStatus({ error: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleAction = async (action, params = {}) => {
    setActing(true);
    try {
      const res = await base44.functions.invoke("manageSyncAdminAction", { action, ...params });
      if (action === "validate_config") setValidation(res?.data?.result);
      else if (action === "create_test_event") setTestResult(res?.data?.result);
      else await loadStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#B8956A' }} />
      </div>
    );
  }

  if (status?.error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-500">
              <AlertCircle className="w-5 h-5" />
              <span>{status.error}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cfg = status?.config;
  const st = status?.status;
  const recent = status?.recent;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-7 h-7" style={{ color: '#B8956A' }} />
          <div>
            <h1 className="text-2xl font-bold">Arriv One Sync Status</h1>
            <p className="text-sm text-gray-500">Admin-only synchronization monitoring and controls</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadStatus} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Activity className="w-5 h-5" style={{ color: '#B8956A' }} /> Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cfg ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Tenant ID</p>
                  <p className="font-mono text-xs">{cfg.arriv_one_tenant_id || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Sync Enabled</p>
                  <Badge variant={cfg.sync_enabled ? "default" : "secondary"}>{cfg.sync_enabled ? "Yes" : "No"}</Badge>
                </div>
                <div>
                  <p className="text-gray-500">Sync Mode</p>
                  <Badge variant={cfg.sync_mode === "active" ? "default" : "outline"}>{cfg.sync_mode}</Badge>
                </div>
                <div>
                  <p className="text-gray-500">Endpoints</p>
                  <p className="text-xs">{cfg.sync_endpoint} · {cfg.manifest_endpoint}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2 border-t">
                <div>
                  <p className="text-gray-500">Last Successful Sync</p>
                  <p className="text-xs">{cfg.last_successful_sync_at ? new Date(cfg.last_successful_sync_at).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Manifest Version</p>
                  <p className="text-xs">{cfg.manifest_version || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Schema Version</p>
                  <p className="text-xs">{cfg.schema_version || "—"}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No tenant configuration found. Create an ArrivOneTenantConfig record to begin.</p>
          )}
        </CardContent>
      </Card>

      {/* Sync Metrics */}
      {st && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-2xl font-bold">{st.queued_events}</span>
            </div>
            <p className="text-xs text-gray-500">Queued Events</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-2xl font-bold">{st.failed_events}</span>
            </div>
            <p className="text-xs text-gray-500">Failed Events</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-2xl font-bold">{st.dead_letter_events}</span>
            </div>
            <p className="text-xs text-gray-500">Dead-Letter Events</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="flex items-center justify-between mb-1">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span className="text-2xl font-bold">{st.open_conflicts}</span>
            </div>
            <p className="text-xs text-gray-500">Open Conflicts</p>
          </CardContent></Card>
        </div>
      )}

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Zap className="w-5 h-5" style={{ color: '#B8956A' }} /> Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="outline" disabled={acting} onClick={() => handleAction("validate_config")}>
              <ClipboardCheck className="w-4 h-4 mr-2" /> Validate Configuration
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={() => handleAction("create_test_event", { mode: "emit" })}>
              <FlaskConical className="w-4 h-4 mr-2" /> Create Test Event
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={() => handleAction("sync_manifests_now")}>
              <FileText className="w-4 h-4 mr-2" /> Sync Manifests Now
            </Button>
            <Button size="sm" variant="outline" disabled={acting} onClick={() => handleAction("run_reconciliation")}>
              <Database className="w-4 h-4 mr-2" /> Run Reconciliation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="w-5 h-5" style={{ color: '#B8956A' }} />
              Configuration Validation
              {validation.all_passed
                ? <Badge variant="default" className="bg-green-600">All Passed</Badge>
                : <Badge variant="destructive">Issues Found</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div><p className="text-gray-500">Signature Version</p><p className="font-mono">{validation.signature_version}</p></div>
              <div><p className="text-gray-500">Schema Version</p><p className="font-mono">{validation.envelope_schema_version}</p></div>
              <div><p className="text-gray-500">Can Enable Test Mode</p><Badge variant={validation.can_enable_test_mode ? "default" : "destructive"}>{validation.can_enable_test_mode ? "Yes" : "No"}</Badge></div>
            </div>
            <div className="space-y-1 pt-2 border-t">
              {validation.checks?.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {c.passed
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                  <div>
                    <p className="font-medium">{c.check}</p>
                    {c.detail && <p className="text-gray-400">{c.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
            {validation.deferred_entities?.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-amber-600 mb-1">Deferred Entities (not in initial sync):</p>
                {validation.deferred_entities.map(d => (
                  <p key={d.entity} className="text-xs text-gray-400">{d.entity}: {d.reason}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Event Result */}
      {testResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlaskConical className="w-5 h-5" style={{ color: '#B8956A' }} />
              Test Event {testResult.mode === "simulate_inbound" ? "(Simulate Inbound)" : "(Emitted)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {testResult.outbox_id && <p>Outbox ID: <span className="font-mono">{testResult.outbox_id}</span></p>}
            <p>Event ID: <span className="font-mono">{testResult.event_id}</span></p>
            <p>Event Type: <span className="font-mono">{testResult.event_type}</span></p>
            <p>Canonical Entity: <span className="font-mono">{testResult.entity_type}</span></p>
            <p>Immutable Shared ID: <span className="font-mono">{testResult.immutable_shared_id}</span></p>
            {testResult.note && <p className="text-gray-500 italic">{testResult.note}</p>}
            {testResult.debug?.payload_hash && (
              <p className="text-gray-400">Payload Hash: <span className="font-mono">{testResult.debug.payload_hash}</span></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      {recent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Failed Outbox Events</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {recent.failed_outbox?.length === 0 && <p className="text-xs text-gray-400">None</p>}
              {recent.failed_outbox?.map(e => (
                <div key={e.id} className="flex items-center justify-between text-xs border-b pb-1">
                  <div>
                    <p className="font-medium">{e.event_type}</p>
                    <p className="text-gray-400 truncate max-w-48">{e.last_delivery_error}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={acting}
                    onClick={() => handleAction("retry_outbox", { outbox_id: e.id })}>
                    Retry
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Dead-Letter Events</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {recent.dead_letter_outbox?.length === 0 && <p className="text-xs text-gray-400">None</p>}
              {recent.dead_letter_outbox?.map(e => (
                <div key={e.id} className="flex items-center justify-between text-xs border-b pb-1">
                  <div>
                    <p className="font-medium">{e.event_type}</p>
                    <p className="text-gray-400 truncate max-w-48">{e.last_delivery_error}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={acting}
                    onClick={() => handleAction("retry_outbox", { outbox_id: e.id })}>
                    Retry
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Open Conflicts</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {recent.open_conflicts?.length === 0 && <p className="text-xs text-gray-400">None</p>}
              {recent.open_conflicts?.map(c => (
                <div key={c.id} className="text-xs border-b pb-1">
                  <p className="font-medium">{c.entity_type} — {c.conflict_type}</p>
                  <p className="text-gray-400">{c.conflict_reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Recent Inbound (Applied)</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {recent.recent_inbox_applied?.length === 0 && <p className="text-xs text-gray-400">None</p>}
              {recent.recent_inbox_applied?.map(e => (
                <div key={e.id} className="text-xs border-b pb-1">
                  <p className="font-medium">{e.event_type}</p>
                  <p className="text-gray-400">{e.processed_at ? new Date(e.processed_at).toLocaleString() : ""}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manifests */}
      {recent?.manifests && recent.manifests.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Product Manifests</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recent.manifests.map(m => (
                <div key={m.id} className="flex items-center justify-between text-xs border-b pb-1">
                  <span className="font-medium">{m.manifest_type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">v{m.manifest_version}</span>
                    <Badge variant={m.apply_status === "applied" ? "default" : m.apply_status === "rejected" ? "destructive" : "secondary"}>
                      {m.apply_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}