import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Plus, Webhook, Globe, RefreshCw, Trash2, Copy, Send, Key, AlertCircle, CheckCircle2, X } from "lucide-react";
import IdentityMatchingQueue from "./IdentityMatchingQueue";

const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const CREAM = "#FFFBF5";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const MUTED_LIGHT = "rgba(26,26,26,0.35)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "12px",
};

const CONNECTION_STATUS_STYLES = {
  not_configured: { bg: "rgba(26,26,26,0.06)", text: "rgba(26,26,26,0.5)", label: "Not Configured" },
  connecting: { bg: "rgba(59,130,246,0.1)", text: "#2563EB", label: "Connecting" },
  connected: { bg: "rgba(184,149,106,0.15)", text: GOLD_DARK, label: "Connected" },
  syncing: { bg: "rgba(59,130,246,0.1)", text: "#2563EB", label: "Syncing" },
  degraded: { bg: "rgba(245,158,11,0.1)", text: "#D97706", label: "Degraded" },
  auth_required: { bg: "rgba(249,115,22,0.1)", text: "#EA580C", label: "Authorization Required" },
  error: { bg: "rgba(239,68,68,0.1)", text: "#DC2626", label: "Error" },
  disabled: { bg: "rgba(26,26,26,0.06)", text: "rgba(26,26,26,0.4)", label: "Disabled" },
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
  const [stagingCount, setStagingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showMatching, setShowMatching] = useState(false);
  const [busy, setBusy] = useState({});

  const loadSources = useCallback(async () => {
    try {
      const res = await base44.entities.PerformanceDataSource.list("-created_date", 50);
      const list = res?.data ?? res;
      setSources(Array.isArray(list) ? list : []);

      const stagingRes = await base44.entities.PerformanceIngestionStaging.filter({ status: "needs_matching" });
      const staging = stagingRes?.data ?? stagingRes;
      setStagingCount(Array.isArray(staging) ? staging.length : 0);
    } catch { setSources([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  const setBusyState = (id, val) => setBusy(prev => ({ ...prev, [id]: val }));

  const handleCreate = async (config) => {
    try {
      await base44.functions.invoke("managePerformanceDataSources", {
        action: "create",
        ...config,
      });
      setShowCreate(false);
      await loadSources();
    } catch (e) {
      alert("Failed to create source: " + (e.message || "unknown error"));
    }
  };

  const handleAction = async (source, action) => {
    setBusyState(source.source_id, true);
    try {
      if (action === "toggle") {
        await base44.entities.PerformanceDataSource.update(source.id, {
          enabled: !source.enabled,
          connection_status: !source.enabled ? "connected" : "disabled",
        });
      } else if (action === "sync") {
        await base44.functions.invoke("syncPerformanceDataSource", {
          source_id: source.source_id,
          tenant_id: tenantId,
          backfill: !source.last_sync_completed_at,
        });
      } else if (action === "rotate") {
        await base44.functions.invoke("managePerformanceDataSources", {
          action: "rotate_token",
          source_id: source.source_id,
        });
      } else if (action === "test_webhook") {
        await base44.functions.invoke("managePerformanceDataSources", {
          action: "test_webhook",
          source_id: source.source_id,
        });
      } else if (action === "delete") {
        if (!window.confirm("Delete this data source? Historical observations will be preserved.")) return;
        await base44.functions.invoke("managePerformanceDataSources", {
          action: "delete",
          source_id: source.source_id,
        });
      }
      await loadSources();
    } catch (e) {
      alert("Action failed: " + (e.message || "unknown error"));
    } finally {
      setBusyState(source.source_id, false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: MUTED }} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Arriv One native card */}
      {arrivOneConnected && (
        <div className="p-4" style={{ ...whiteCard, border: "1px solid rgba(184,149,106,0.3)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.12)" }}>
                <CheckCircle2 className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: TEXT_DARK }}>Arriv One (Native)</p>
                <p className="text-xs" style={{ color: MUTED }}>Performance data flows automatically</p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD_DARK }}>
              Connected
            </span>
          </div>
        </div>
      )}

      {/* Staging banner */}
      {stagingCount > 0 && (
        <div className="p-3 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" style={{ color: "#D97706" }} />
            <span className="text-sm font-medium" style={{ color: TEXT_DARK }}>
              {stagingCount} record{stagingCount !== 1 ? "s" : ""} need identity matching
            </span>
          </div>
          <button onClick={() => setShowMatching(true)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>
            Review Now
          </button>
        </div>
      )}

      {/* Sources list */}
      {sources.length === 0 && !arrivOneConnected ? (
        <div className="text-center py-8">
          <Webhook className="w-10 h-10 mx-auto mb-2" style={{ color: MUTED_LIGHT }} />
          <p className="text-sm" style={{ color: MUTED }}>No data sources connected yet.</p>
          <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>Create a webhook or API source to start receiving performance data.</p>
        </div>
      ) : (
        sources.map(source => {
          const status = CONNECTION_STATUS_STYLES[source.connection_status] || CONNECTION_STATUS_STYLES.not_configured;
          const isBusy = busy[source.source_id];
          return (
            <div key={source.id} className="p-4" style={whiteCard}>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {source.connection_mode === "webhook_push" ? <Webhook className="w-4 h-4 shrink-0" style={{ color: GOLD }} /> : <Globe className="w-4 h-4 shrink-0" style={{ color: GOLD }} />}
                    <p className="text-sm font-semibold truncate" style={{ color: TEXT_DARK }}>{source.name}</p>
                  </div>
                  <p className="text-xs" style={{ color: MUTED }}>{PROVIDER_LABELS[source.provider] || source.provider}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: status.bg, color: status.text }}>
                  {status.label}
                </span>
              </div>

              {/* Webhook URL */}
              {source.connection_mode === "webhook_push" && source.webhook_token && (
                <div className="mb-3">
                  <label className="text-xs font-medium mb-1 block" style={{ color: MUTED }}>Webhook URL</label>
                  <div className="flex items-center gap-1">
                    <input
                      readOnly
                      value={getWebhookUrl(source)}
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg truncate"
                      style={{ backgroundColor: "rgba(26,26,26,0.04)", border: "1px solid rgba(184,149,106,0.15)", color: MUTED }}
                    />
                    <button onClick={() => copyToClipboard(getWebhookUrl(source))} className="p-1.5 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD }} title="Copy URL">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs mb-3" style={{ color: MUTED }}>
                <span>{source.total_records_received || 0} received</span>
                <span>{source.records_imported || 0} imported</span>
                {source.last_received_at && <span>Last: {new Date(source.last_received_at).toLocaleDateString()}</span>}
              </div>

              {source.last_error && (
                <div className="text-xs p-2 rounded mb-3" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#DC2626" }}>
                  {source.last_error}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-2" style={{ borderTop: "1px solid rgba(184,149,106,0.1)" }}>
                {source.connection_mode === "generic_api_pull" && (
                  <button onClick={() => handleAction(source, "sync")} disabled={isBusy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD, border: "1px solid rgba(184,149,106,0.2)" }}>
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync
                  </button>
                )}
                {source.connection_mode === "webhook_push" && (
                  <button onClick={() => handleAction(source, "test_webhook")} disabled={isBusy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD, border: "1px solid rgba(184,149,106,0.2)" }}>
                    {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Test
                  </button>
                )}
                <button onClick={() => handleAction(source, "rotate")} disabled={isBusy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD, border: "1px solid rgba(184,149,106,0.2)" }}>
                  <Key className="w-3 h-3" /> Rotate
                </button>
                <button onClick={() => handleAction(source, "toggle")} disabled={isBusy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium" style={{ backgroundColor: source.enabled ? "rgba(26,26,26,0.06)" : "rgba(184,149,106,0.1)", color: source.enabled ? MUTED : GOLD }}>
                  {source.enabled ? "Disable" : "Enable"}
                </button>
                <button onClick={() => handleAction(source, "delete")} disabled={isBusy} className="text-xs px-2.5 py-1.5 rounded-lg font-medium ml-auto" style={{ color: "#DC2626" }}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* Create button */}
      <button
        onClick={() => setShowCreate(true)}
        className="w-full p-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
        style={{ border: "1px dashed rgba(184,149,106,0.3)", color: GOLD, backgroundColor: "transparent" }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.05)"; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        <Plus className="w-4 h-4" /> Add Data Source
      </button>

      {/* Create modal */}
      {showCreate && (
        <CreateSourceModal onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
      )}

      {/* Identity matching queue */}
      {showMatching && (
        <IdentityMatchingQueue tenantId={tenantId} onResolved={loadSources} onClose={() => setShowMatching(false)} />
      )}
    </div>
  );
}

function CreateSourceModal({ onCreate, onCancel }) {
  const [mode, setMode] = useState("webhook_push");
  const [name, setName] = useState("");
  const [apiConfig, setApiConfig] = useState({
    base_url: "",
    auth_type: "none",
    records_path: "",
    pagination_type: "offset",
    page_size: 100,
    backfill_days: 90,
  });

  const handleSubmit = () => {
    if (!name.trim()) return alert("Enter a name");
    onCreate({
      name: name.trim(),
      provider: mode === "webhook_push" ? "custom_webhook" : "generic_api",
      connection_mode: mode,
      api_config: mode === "generic_api_pull" ? apiConfig : null,
      sync_cadence: mode === "generic_api_pull" ? "daily" : "manual",
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel} style={{ backdropFilter: "blur(4px)" }}>
      <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" style={{ ...whiteCard, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Add Data Source</h3>
          <button onClick={onCancel} className="p-1 rounded" style={{ color: MUTED }}><X className="w-4 h-4" /></button>
        </div>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setMode("webhook_push")} className="p-3 rounded-lg text-left transition-all" style={{ border: mode === "webhook_push" ? "2px solid " + GOLD : "1px solid rgba(184,149,106,0.2)", backgroundColor: mode === "webhook_push" ? "rgba(184,149,106,0.05)" : "#FFFFFF" }}>
            <Webhook className="w-5 h-5 mb-1" style={{ color: GOLD }} />
            <p className="text-sm font-semibold" style={{ color: TEXT_DARK }}>Webhook</p>
            <p className="text-xs" style={{ color: MUTED }}>Push data to a URL</p>
          </button>
          <button onClick={() => setMode("generic_api_pull")} className="p-3 rounded-lg text-left transition-all" style={{ border: mode === "generic_api_pull" ? "2px solid " + GOLD : "1px solid rgba(184,149,106,0.2)", backgroundColor: mode === "generic_api_pull" ? "rgba(184,149,106,0.05)" : "#FFFFFF" }}>
            <Globe className="w-5 h-5 mb-1" style={{ color: GOLD }} />
            <p className="text-sm font-semibold" style={{ color: TEXT_DARK }}>REST API</p>
            <p className="text-xs" style={{ color: MUTED }}>Pull data on schedule</p>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: MUTED }}>Source Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Salesforce Performance Feed" className="w-full text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }} />
          </div>

          {mode === "generic_api_pull" && (
            <>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: MUTED }}>API Base URL</label>
                <input value={apiConfig.base_url} onChange={e => setApiConfig({ ...apiConfig, base_url: e.target.value })} placeholder="https://api.example.com/v1" className="w-full text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: MUTED }}>Records Path</label>
                  <input value={apiConfig.records_path} onChange={e => setApiConfig({ ...apiConfig, records_path: e.target.value })} placeholder="/employees" className="w-full text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: MUTED }}>Auth Type</label>
                  <select value={apiConfig.auth_type} onChange={e => setApiConfig({ ...apiConfig, auth_type: e.target.value })} className="w-full text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }}>
                    <option value="none">None</option>
                    <option value="api_key">API Key</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {mode === "webhook_push" && (
            <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.06)", border: "1px solid rgba(184,149,106,0.15)" }}>
              <p className="text-xs" style={{ color: MUTED }}>A unique webhook URL will be generated after creation. Send POST requests with performance data to that URL.</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-5">
          <button onClick={handleSubmit} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-lg" style={{ backgroundColor: GOLD, color: TEXT_DARK }}>Create Source</button>
          <button onClick={onCancel} className="text-sm px-4 py-2.5 rounded-lg" style={{ backgroundColor: "rgba(26,26,26,0.06)", color: MUTED }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}