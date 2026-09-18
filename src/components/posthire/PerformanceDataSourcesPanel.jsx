import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Plus, Webhook, Database, Copy, Check, RefreshCw, Trash2,
  Send, Zap, Eye, AlertCircle, ChevronDown, ChevronUp, Power
} from "lucide-react";
import { toast } from "sonner";
import IdentityMatchingQueue from "./IdentityMatchingQueue";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
};

const CONNECTION_STATUS_STYLES = {
  not_configured: { color: "bg-gray-100 text-gray-600", label: "Not Configured" },
  connecting:     { color: "bg-blue-100 text-blue-700", label: "Connecting" },
  connected:      { color: "bg-green-100 text-green-700", label: "Connected" },
  syncing:        { color: "bg-blue-100 text-blue-700", label: "Syncing" },
  degraded:       { color: "bg-amber-100 text-amber-700", label: "Degraded" },
  auth_required:  { color: "bg-orange-100 text-orange-700", label: "Authorization Required" },
  error:          { color: "bg-red-100 text-red-700", label: "Error" },
  disabled:       { color: "bg-gray-100 text-gray-500", label: "Disabled" },
};

const PROVIDER_LABELS = {
  arriv_one: "Arriv One",
  custom_webhook: "Webhook",
  generic_api: "Generic REST API",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
  lattice: "Lattice",
  "15five": "15Five",
  manual_import: "Manual Import",
};

function getWebhookUrl(source) {
  return `${window.location.origin}/functions/receivePerformanceData?source=${source.source_id}&token=${source.webhook_token}`;
}

export default function PerformanceDataSourcesPanel({ tenantId, arrivOneConnected }) {
  const [sources, setSources] = useState([]);
  const [stagedCount, setStagedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [busy, setBusy] = useState({});

  const loadSources = useCallback(async () => {
    try {
      const tid = tenantId || "tnt_estate_media";
      const [srcRes, stagedRes] = await Promise.all([
        base44.entities.PerformanceDataSource.filter({ tenant_id: tid }, "-created_date", 50),
        base44.entities.PerformanceIngestionStaging.filter({ tenant_id: tid, status: "needs_matching" }),
      ]);
      const srcs = srcRes?.data ?? srcRes ?? [];
      const staged = stagedRes?.data ?? stagedRes ?? [];
      setSources(Array.isArray(srcs) ? srcs : []);
      setStagedCount(Array.isArray(staged) ? staged.length : 0);
    } catch (_) {}
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadSources(); }, [loadSources]);

  const setBusyFor = (id, val) => setBusy(prev => ({ ...prev, [id]: val }));

  const handleCreate = async (formData) => {
    setBusyFor("create", true);
    try {
      await base44.functions.invoke("managePerformanceDataSources", formData);
      toast.success("Data source created");
      setShowCreate(false);
      loadSources();
    } catch (e) {
      toast.error("Failed to create source");
    }
    setBusyFor("create", false);
  };

  const handleAction = async (action, source, extra = {}) => {
    setBusyFor(source.source_id, true);
    try {
      const res = await base44.functions.invoke("managePerformanceDataSources", {
        action, source_id: source.source_id, tenant_id: tenantId, ...extra,
      });
      const data = res?.data ?? res;
      if (action === "test") {
        if (data?.success) toast.success(`Connection OK — ${data.recordCount ?? 0} records found`);
        else toast.error(data?.error || "Connection failed");
      } else if (action === "discover") {
        if (data?.success) toast.success(`Discovered fields: ${(data.fields || []).join(", ")}`);
        else toast.error(data?.error || "Discovery failed");
      } else if (action === "rotate_token") {
        toast.success("Webhook token rotated");
      } else if (action === "test_webhook") {
        toast.success("Test webhook sent");
      } else if (action === "delete") {
        toast.success("Source deleted");
      }
      loadSources();
    } catch (e) {
      toast.error("Action failed");
    }
    setBusyFor(source.source_id, false);
  };

  const handleSync = async (source) => {
    setBusyFor(source.source_id, true);
    try {
      const res = await base44.functions.invoke("syncPerformanceDataSource", {
        source_id: source.source_id,
        tenant_id: tenantId,
        backfill: !source.last_sync_completed_at,
      });
      const data = res?.data ?? res;
      if (data?.success) toast.success(`Synced — ${data.imported} imported, ${data.staged_for_matching} staged`);
      else toast.error(data?.error || "Sync failed");
      loadSources();
    } catch (e) {
      toast.error("Sync failed");
    }
    setBusyFor(source.source_id, false);
  };

  const handleToggle = async (source) => {
    try {
      await base44.entities.PerformanceDataSource.update(source.id, {
        enabled: !source.enabled,
        updated_at: new Date().toISOString(),
      });
      loadSources();
    } catch (e) {
      toast.error("Failed to toggle");
    }
  };

  const copyUrl = (source) => {
    navigator.clipboard.writeText(getWebhookUrl(source));
    setCopiedId(source.source_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} /></div>;
  }

  const arrivOneSource = sources.find(s => s.provider === "arriv_one");
  const otherSources = sources.filter(s => s.provider !== "arriv_one");

  return (
    <div className="space-y-4">
      {/* Staged records banner */}
      {stagedCount > 0 && (
        <div className="p-3 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" style={{ color: "#F59E0B" }} />
            <span className="text-sm font-medium" style={{ color: CREAM }}>
              {stagedCount} record{stagedCount !== 1 ? "s" : ""} need identity matching
            </span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowQueue(!showQueue)} style={{ color: "#F59E0B", fontSize: "12px" }}>
            {showQueue ? "Hide" : "Review Now"}
          </Button>
        </div>
      )}

      {showQueue && (
        <IdentityMatchingQueue tenantId={tenantId} onResolved={loadSources} />
      )}

      {/* Arriv One native card */}
      {arrivOneConnected && (
        <div className="p-4" style={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
                <Zap className="w-5 h-5" style={{ color: GOLD }} />
              </div>
              <div>
                <p className="font-semibold" style={{ ...SERIF, color: CREAM }}>Arriv One (Native)</p>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>Connected — outcomes flow automatically</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Connected</span>
          </div>
        </div>
      )}

      {/* Other sources */}
      {otherSources.length === 0 && !arrivOneConnected ? (
        <div className="p-8 text-center" style={card}>
          <Database className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.4)" }} />
          <p className="font-medium" style={{ color: CREAM }}>No data sources configured</p>
          <p className="text-sm mt-1" style={{ color: MUTED_LIGHT }}>Create a webhook or API source to start ingesting performance data.</p>
        </div>
      ) : (
        otherSources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            expanded={expandedSource === source.source_id}
            onToggleExpand={() => setExpandedSource(expandedSource === source.source_id ? null : source.source_id)}
            onAction={handleAction}
            onSync={handleSync}
            onToggle={handleToggle}
            onCopy={copyUrl}
            copied={copiedId === source.source_id}
            busy={busy[source.source_id]}
          />
        ))
      )}

      {/* Create button */}
      {!showCreate ? (
        <Button
          onClick={() => setShowCreate(true)}
          variant="outline"
          className="w-full border-dashed"
          style={{ borderColor: "rgba(184,149,106,0.4)", color: GOLD, backgroundColor: "transparent" }}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Data Source
        </Button>
      ) : (
        <CreateSourceForm onCreate={handleCreate} onCancel={() => setShowCreate(false)} busy={busy.create} />
      )}
    </div>
  );
}

function SourceCard({ source, expanded, onToggleExpand, onAction, onSync, onToggle, onCopy, copied, busy }) {
  const status = CONNECTION_STATUS_STYLES[source.connection_status] || CONNECTION_STATUS_STYLES.not_configured;
  const isWebhook = source.connection_mode === "webhook_push";

  return (
    <div style={card} className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
              {isWebhook ? <Webhook className="w-5 h-5" style={{ color: GOLD }} /> : <Database className="w-5 h-5" style={{ color: GOLD }} />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate" style={{ ...SERIF, color: CREAM }}>{source.name}</p>
              <p className="text-xs" style={{ color: MUTED_LIGHT }}>
                {PROVIDER_LABELS[source.provider] || source.provider} · {source.connection_mode === "webhook_push" ? "Webhook" : "API Pull"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
            <button onClick={() => onToggle(source)} disabled={busy} className="p-1.5 rounded hover:bg-white/5">
              <Power className="w-4 h-4" style={{ color: source.enabled ? GOLD : MUTED_LIGHT }} />
            </button>
            <button onClick={onToggleExpand} className="p-1.5 rounded hover:bg-white/5">
              {expanded ? <ChevronUp className="w-4 h-4" style={{ color: MUTED_LIGHT }} /> : <ChevronDown className="w-4 h-4" style={{ color: MUTED_LIGHT }} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: MUTED_LIGHT }}>
          <span>{source.total_records_received || 0} received</span>
          <span>{source.records_imported || 0} imported</span>
          {source.last_received_at && <span>Last: {new Date(source.last_received_at).toLocaleDateString()}</span>}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: "rgba(184,149,106,0.12)" }}>
          {source.last_error && (
            <div className="mt-3 p-2 rounded text-xs" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#FCA5A5" }}>
              {source.last_error}
            </div>
          )}

          {isWebhook && source.webhook_token && (
            <div className="mt-3">
              <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Webhook URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={getWebhookUrl(source)}
                  className="text-xs"
                  style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM, ...MONO, fontSize: "11px" }}
                />
                <Button size="sm" variant="ghost" onClick={() => onCopy(source)} style={{ color: copied ? GOLD : MUTED_LIGHT }}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {source.api_config && source.api_config.base_url && (
            <div className="mt-3">
              <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>API Base URL</Label>
              <Input readOnly value={source.api_config.base_url} className="text-xs" style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM, ...MONO, fontSize: "11px" }} />
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {isWebhook ? (
              <>
                <Button size="sm" variant="outline" onClick={() => onAction("test_webhook", source)} disabled={busy} style={{ borderColor: "rgba(184,149,106,0.3)", color: CREAM }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Test Webhook
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAction("rotate_token", source)} disabled={busy} style={{ borderColor: "rgba(184,149,106,0.3)", color: CREAM }}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rotate Token
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => onAction("test", source)} disabled={busy} style={{ borderColor: "rgba(184,149,106,0.3)", color: CREAM }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />} Test
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAction("discover", source)} disabled={busy} style={{ borderColor: "rgba(184,149,106,0.3)", color: CREAM }}>
                  <Eye className="w-3.5 h-3.5 mr-1.5" /> Discover
                </Button>
                <Button size="sm" variant="outline" onClick={() => onSync(source)} disabled={busy} style={{ borderColor: "rgba(184,149,106,0.3)", color: CREAM }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />} Sync Now
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => onAction("delete", source)} disabled={busy} style={{ borderColor: "rgba(239,68,68,0.3)", color: "#FCA5A5" }}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
            </Button>
          </div>

          {isWebhook && (
            <div className="pt-2 text-xs space-y-1" style={{ color: MUTED_LIGHT }}>
              <p className="font-semibold" style={{ color: GOLD }}>Identity-based payload (recommended):</p>
              <pre className="p-2 rounded overflow-x-auto text-xs" style={{ backgroundColor: "#0A0A0A", ...MONO, fontSize: "10px" }}>{`{
  "identity": { "email": "jane@co.com" },
  "metrics": { "quota_attainment": 95 },
  "period_start": "2026-01-01",
  "recorded_at": "2026-09-01T10:00:00Z"
}`}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateSourceForm({ onCreate, onCancel, busy }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("webhook_push");
  const [baseUrl, setBaseUrl] = useState("");
  const [recordsPath, setRecordsPath] = useState("");
  const [authType, setAuthType] = useState("none");
  const [backfillDays, setBackfillDays] = useState(90);

  const handleSubmit = () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    if (mode === "generic_api_pull" && !baseUrl.trim()) { toast.error("Base URL required"); return; }
    const payload = {
      action: "create",
      name: name.trim(),
      provider: mode === "webhook_push" ? "custom_webhook" : "generic_api",
      connection_mode: mode,
    };
    if (mode === "generic_api_pull") {
      payload.api_config = {
        base_url: baseUrl.trim(),
        auth_type: authType,
        records_path: recordsPath.trim() || null,
        pagination_type: "offset",
        page_size: 100,
        backfill_days: backfillDays,
      };
      payload.sync_cadence = "daily";
    }
    onCreate(payload);
  };

  return (
    <div className="p-4 space-y-3" style={card}>
      <p className="font-semibold" style={{ ...SERIF, color: CREAM }}>New Data Source</p>
      <div>
        <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HRIS Performance Feed" style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM }} />
      </div>
      <div>
        <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Connection Mode</Label>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook_push">Webhook (Push)</SelectItem>
            <SelectItem value="generic_api_pull">REST API (Pull)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === "generic_api_pull" && (
        <>
          <div>
            <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Base URL</Label>
            <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1/performance" style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM, ...MONO, fontSize: "12px" }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Records Path</Label>
              <Input value={recordsPath} onChange={e => setRecordsPath(e.target.value)} placeholder="data.records" style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM, ...MONO, fontSize: "12px" }} />
            </div>
            <div>
              <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Auth Type</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="api_key">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Backfill Days</Label>
            <Input type="number" value={backfillDays} onChange={e => setBackfillDays(parseInt(e.target.value) || 90)} style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM }} />
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSubmit} disabled={busy} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />} Create
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} style={{ color: MUTED_LIGHT }}>Cancel</Button>
      </div>
    </div>
  );
}