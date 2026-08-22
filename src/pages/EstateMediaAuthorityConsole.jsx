import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield, Building2, Network, Package, RefreshCw, Users, Briefcase,
  Plug, FileText, Activity, ArrowLeft, CheckCircle2, AlertTriangle,
  XCircle, Clock, Cpu, Layers, GitBranch, Eye, LogOut,
} from "lucide-react";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "organization", label: "Arriv Organization", icon: Building2 },
  { id: "capabilities", label: "Canonical Capabilities", icon: Layers },
  { id: "manifest", label: "ProductManifest", icon: Package },
  { id: "sync", label: "Sync & Convergence", icon: RefreshCw },
  { id: "people", label: "People", icon: Users },
  { id: "operations", label: "Media Operations", icon: Briefcase },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "audit", label: "Audit", icon: FileText },
];

const CONVERGENCE_STYLES = {
  CONVERGED: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  NOT_CONFIGURED: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  FALLBACK_ACTIVE: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  STALE: { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  EXPECTED_VERSION_FETCH_FAILED: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
  INCOMPATIBLE: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
};

const SYNC_STYLES = {
  HEALTHY: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  DEGRADED: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  QUEUE_BACKLOG: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  AUTH_FAILED: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
  CONTRACT_MISMATCH: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
  NOT_CONFIGURED: { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: AlertTriangle },
};

function StatusBadge({ status, styles }) {
  const style = styles[status] || { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: AlertTriangle };
  const Icon = style.icon;
  return (
    <Badge className={`${style.color} border gap-1`}>
      <Icon className="w-3 h-3" />
      {status}
    </Badge>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#FFFBF5]/50 uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-[#FFFBF5] mt-1">{value}</p>
          </div>
          {Icon && (
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent || "bg-[#B8956A]/10"}`}>
              <Icon className="w-5 h-5 text-[#B8956A]" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EstateMediaAuthorityConsole() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await base44.functions.invoke("getEstateMediaAuthorityConsole", {});
      setData(result?.data || result);
    } catch (e) {
      setError(e.message || "Failed to load authority console data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-[#B8956A] mx-auto mb-4 animate-pulse" />
          <p className="text-[#FFFBF5]/70">Loading Estate Media Authority Console...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <Card className="bg-[#1A1A1A] border-red-500/30 max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-[#FFFBF5] font-medium mb-2">Access Denied</p>
            <p className="text-[#FFFBF5]/60 text-sm mb-4">{error}</p>
            <Button onClick={() => window.history.back()} variant="outline" className="border-[#B8956A]/30 text-[#FFFBF5]">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { authority, organization, tenant, sync, manifest, canonical_capabilities, people, media_ops, business_data, integrations, audit } = data;

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Operational View Banner */}
      <div className="sticky top-0 z-40 bg-[#B8956A] border-b border-[#B8956A]/50">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#1A1A1A]" />
            <span className="text-sm font-medium text-[#1A1A1A]">
              Viewing Arriv Estate Media as Platform Administrator
            </span>
            <Badge className="bg-[#1A1A1A] text-[#B8956A] border-0 ml-2">OPERATIONAL VIEW</Badge>
          </div>
          <Button
            size="sm"
            onClick={() => window.location.href = createPageUrl("AdminHub")}
            className="bg-[#1A1A1A] text-[#B8956A] hover:bg-[#1A1A1A]/90"
          >
            <LogOut className="w-4 h-4 mr-1" /> Exit Operational View
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#1A1A1A] border-b border-[#B8956A]/20">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-[#B8956A]" />
            <h1 className="text-2xl font-bold text-[#FFFBF5]">Estate Media Authority Console</h1>
          </div>
          <p className="text-[#FFFBF5]/60 text-sm">
            Platform Authority · {authority.canonical_organization} · {authority.operational_context}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Badge className="bg-[#B8956A]/15 text-[#B8956A] border-[#B8956A]/30">
              Actor: {authority.actual_actor.email}
            </Badge>
            <Badge className="bg-[#B8956A]/15 text-[#B8956A] border-[#B8956A]/30">
              Role: {authority.actual_actor.role}
            </Badge>
            <Badge className="bg-[#B8956A]/15 text-[#B8956A] border-[#B8956A]/30">
              Legal Employer: {organization.legal_employer}
            </Badge>
          </div>
        </div>
      </div>

      {/* Navigation + Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar */}
        <nav className="hidden md:block w-56 shrink-0">
          <div className="space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#B8956A] text-[#1A1A1A]"
                      : "text-[#FFFBF5]/70 hover:bg-[#FFFBF5]/5 hover:text-[#FFFBF5]"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {s.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Mobile section selector */}
        <div className="md:hidden mb-4 w-full">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-[#B8956A]/30 text-[#FFFBF5] rounded-lg px-3 py-2"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeSection === "overview" && <OverviewSection data={data} />}
          {activeSection === "organization" && <OrganizationSection data={data} />}
          {activeSection === "capabilities" && <CapabilitiesSection capabilities={canonical_capabilities} />}
          {activeSection === "manifest" && <ManifestSection manifest={manifest} />}
          {activeSection === "sync" && <SyncSection sync={sync} />}
          {activeSection === "people" && <PeopleSection people={people} />}
          {activeSection === "operations" && <OperationsSection media_ops={media_ops} business_data={business_data} />}
          {activeSection === "integrations" && <IntegrationsSection integrations={integrations} />}
          {activeSection === "audit" && <AuditSection audit={audit} />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({ data }) {
  const { authority, organization, tenant, sync, manifest, people, media_ops, business_data } = data;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#FFFBF5] mb-4">Application Health Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Sync Status" value={sync.diagnostics} icon={RefreshCw}
            accent={sync.diagnostics === "HEALTHY" ? "bg-emerald-500/10" : "bg-amber-500/10"} />
          <StatCard label="Manifest Fetch" value={manifest.expected_version_fetch_ok ? "OK" : "FAILED"} icon={Package}
            accent={manifest.expected_version_fetch_ok ? "bg-emerald-500/10" : "bg-red-500/10"} />
          <StatCard label="AO Reachable" value={manifest.ao_reachable ? "Yes" : "No"} icon={Network}
            accent={manifest.ao_reachable ? "bg-emerald-500/10" : "bg-red-500/10"} />
          <StatCard label="Tenant Isolation" value={business_data.tenant_isolation_healthy ? "Healthy" : "Degraded"} icon={Shield}
            accent={business_data.tenant_isolation_healthy ? "bg-emerald-500/10" : "bg-red-500/10"} />
        </div>
      </div>

      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardHeader><CardTitle className="text-[#FFFBF5] flex items-center gap-2"><Building2 className="w-5 h-5 text-[#B8956A]" /> Identity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row label="Canonical Organization" value={organization.canonical} />
          <Row label="Application" value="Arriv Estate Media" />
          <Row label="Operational Context" value={tenant.operational_context} />
          <Row label="Legal Employer" value={organization.legal_employer} />
          <Row label="Authority Model" value={tenant.model} />
          <Row label="EM Runtime Version" value={manifest.em_runtime_version} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] flex items-center gap-2"><RefreshCw className="w-5 h-5 text-[#B8956A]" /> Sync Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Mode" value={sync.mode} />
            <Row label="Last Successful Sync" value={sync.last_successful_sync ? new Date(sync.last_successful_sync).toLocaleString() : "N/A"} />
            <Row label="Inbox Applied" value={`${sync.inbox.applied} / ${sync.inbox.total}`} />
            <Row label="Outbox Delivered" value={`${sync.outbox.delivered} / ${sync.outbox.total}`} />
            <Row label="Mappings Linked" value={`${sync.mappings.linked} / ${sync.mappings.total}`} />
            <Row label="Open Conflicts" value={sync.conflicts_open} />
          </CardContent>
        </Card>
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] flex items-center gap-2"><Users className="w-5 h-5 text-[#B8956A]" /> People Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Sales Team Members" value={people.sales_team_members} />
            <Row label="Active Reps" value={people.active_reps} />
            <Row label="Platform Users" value={people.users_total} />
            <Row label="Admin Users" value={people.users_admin} />
            <Row label="Media Jobs" value={media_ops.jobs_total} />
            <Row label="Bookings" value={media_ops.bookings_total} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrganizationSection({ data }) {
  const { organization } = data;
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">Arriv Organization</h2>
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="w-8 h-8 text-[#B8956A]" />
            <div>
              <p className="text-lg font-bold text-[#FFFBF5]">{organization.canonical}</p>
              <p className="text-sm text-[#FFFBF5]/50">Canonical Organization</p>
            </div>
          </div>
          <div className="space-y-3 ml-4 border-l border-[#B8956A]/30 pl-6">
            {organization.structure.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <GitBranch className="w-5 h-5 text-[#B8956A] mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-[#FFFBF5]">{item.name}</p>
                  <p className="text-sm text-[#FFFBF5]/60">{item.role}</p>
                  <Badge className={`mt-1 ${item.authority === "canonical" ? "bg-[#B8956A]/15 text-[#B8956A]" : "bg-blue-500/15 text-blue-400"} border-0`}>
                    {item.authority === "canonical" ? "Canonical Authority" : "Domain Authority"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-[#B8956A]/5 rounded-lg border border-[#B8956A]/20">
            <p className="text-sm text-[#FFFBF5]/70">
              <strong className="text-[#B8956A]">Legal Employer:</strong> {organization.legal_employer}
            </p>
            <p className="text-xs text-[#FFFBF5]/50 mt-1">{organization.note}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CapabilitiesSection({ capabilities }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">Canonical Capability Inventory</h2>
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#B8956A]/20">
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Capability</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Canonical Owner</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Estate Media Role</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Status</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((c, i) => (
                <tr key={i} className="border-b border-[#FFFBF5]/5">
                  <td className="p-3 text-sm text-[#FFFBF5]">{c.capability}</td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70">{c.canonical_owner}</td>
                  <td className="p-3">
                    <Badge className={c.estate_media_role === "authority" ? "bg-blue-500/15 text-blue-400 border-0" : "bg-[#B8956A]/15 text-[#B8956A] border-0"}>
                      {c.estate_media_role}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge className="bg-emerald-500/15 text-emerald-400 border-0">{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ManifestSection({ manifest }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">ProductManifest Convergence</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="EM Runtime" value={manifest.em_runtime_version} icon={Cpu} />
        <StatCard label="AO Reachable" value={manifest.ao_reachable ? "Yes" : "No"} icon={Network}
          accent={manifest.ao_reachable ? "bg-emerald-500/10" : "bg-red-500/10"} />
        <StatCard label="Fetch Status" value={manifest.expected_version_fetch_ok ? "OK" : "FAILED"} icon={Package}
          accent={manifest.expected_version_fetch_ok ? "bg-emerald-500/10" : "bg-red-500/10"} />
        <StatCard label="Stored Manifests" value={manifest.total_stored} icon={Layers} />
      </div>

      {!manifest.expected_version_fetch_ok && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-400 font-medium">Expected Version Fetch Failed</p>
              <p className="text-sm text-red-400/70 mt-1">{manifest.expected_version_error}</p>
              <p className="text-xs text-[#FFFBF5]/50 mt-2">
                This is an explicit diagnostic state — not a false-empty "0 manifests" display.
                The convergence page shows the fetch failure reason rather than implying no manifests exist.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardHeader>
          <CardTitle className="text-[#FFFBF5] flex items-center gap-2">
            <Package className="w-5 h-5 text-[#B8956A]" /> Convergence by Entry Type
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#B8956A]/20">
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Entry Type</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Expected</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Active</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Stored</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(manifest.convergence_by_type).map(([type, info]) => (
                <tr key={type} className="border-b border-[#FFFBF5]/5">
                  <td className="p-3 text-sm text-[#FFFBF5] font-mono">{type}</td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70">{info.expected_version || "—"}</td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70">{info.active_version || "—"}</td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70">{info.stored_count}</td>
                  <td className="p-3"><StatusBadge status={info.convergence} styles={CONVERGENCE_STYLES} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-4">
          <p className="text-sm text-[#FFFBF5]/70">
            <strong className="text-[#B8956A]">Convergence Model:</strong> {manifest.convergence_model}
          </p>
          <p className="text-xs text-[#FFFBF5]/50 mt-1">{manifest.note}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SyncSection({ sync }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">AO⇄EM Sync Health</h2>

      <div className="flex items-center gap-3">
        <span className="text-sm text-[#FFFBF5]/60">Diagnostics:</span>
        <StatusBadge status={sync.diagnostics} styles={SYNC_STYLES} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] text-sm flex items-center gap-2"><ArrowLeft className="w-4 h-4 text-[#B8956A]" /> Inbound (AO→EM)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Total" value={sync.inbox.total} />
            <Row label="Applied" value={sync.inbox.applied} />
            <Row label="Pending" value={sync.inbox.pending} />
            <Row label="Rejected" value={sync.inbox.rejected} />
            <Row label="Duplicate" value={sync.inbox.duplicate} />
            <Row label="Conflict" value={sync.inbox.conflict} />
            <Row label="Stale" value={sync.inbox.stale} />
          </CardContent>
        </Card>
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 text-[#B8956A]" /> Outbound (EM→AO)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Total" value={sync.outbox.total} />
            <Row label="Delivered" value={sync.outbox.delivered} />
            <Row label="Pending" value={sync.outbox.pending} />
            <Row label="Failed" value={sync.outbox.failed} />
            <Row label="Dead Lettered" value={sync.outbox.dead_lettered} />
            <Row label="Suppressed" value={sync.outbox.suppressed} />
          </CardContent>
        </Card>
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] text-sm flex items-center gap-2"><GitBranch className="w-4 h-4 text-[#B8956A]" /> Mappings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Row label="Total" value={sync.mappings.total} />
            <Row label="Linked" value={sync.mappings.linked} />
            <Row label="Stale" value={sync.mappings.stale} />
            <Row label="Error" value={sync.mappings.error} />
            <Row label="Conflict" value={sync.mappings.conflict} />
            <Row label="Open Conflicts" value={sync.conflicts_open} />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardHeader><CardTitle className="text-[#FFFBF5] text-sm">Contract Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Row label="Mode" value={sync.mode} />
          <Row label="Enabled" value={sync.enabled ? "Yes" : "No"} />
          <Row label="Schema Version" value={sync.schema_version} />
          <Row label="Signature Version" value={sync.signature_version} />
          <Row label="Last Successful Sync" value={sync.last_successful_sync ? new Date(sync.last_successful_sync).toLocaleString() : "N/A"} />
          <div className="mt-2">
            <p className="text-xs text-[#FFFBF5]/50 mb-1">Shared Entity Types:</p>
            <div className="flex flex-wrap gap-1">
              {sync.shared_entity_types.map((et) => (
                <Badge key={et} className="bg-[#B8956A]/10 text-[#B8956A] border-[#B8956A]/30 text-xs">{et}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {Object.keys(sync.mappings.by_entity).length > 0 && (
        <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
          <CardHeader><CardTitle className="text-[#FFFBF5] text-sm">Mappings by Entity Type</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#B8956A]/20">
                  <th className="text-left p-3 text-xs font-medium text-[#FFFBF5]/60">Entity</th>
                  <th className="text-left p-3 text-xs font-medium text-[#FFFBF5]/60">Total</th>
                  <th className="text-left p-3 text-xs font-medium text-[#FFFBF5]/60">Linked</th>
                  <th className="text-left p-3 text-xs font-medium text-[#FFFBF5]/60">Stale</th>
                  <th className="text-left p-3 text-xs font-medium text-[#FFFBF5]/60">Error</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(sync.mappings.by_entity).map(([et, m]) => (
                  <tr key={et} className="border-b border-[#FFFBF5]/5">
                    <td className="p-3 text-sm text-[#FFFBF5] font-mono">{et}</td>
                    <td className="p-3 text-sm text-[#FFFBF5]/70">{m.total}</td>
                    <td className="p-3 text-sm text-emerald-400">{m.linked}</td>
                    <td className="p-3 text-sm text-amber-400">{m.stale}</td>
                    <td className="p-3 text-sm text-red-400">{m.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PeopleSection({ people }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">People</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sales Team Members" value={people.sales_team_members} icon={Users} />
        <StatCard label="Active Reps" value={people.active_reps} icon={CheckCircle2} accent="bg-emerald-500/10" />
        <StatCard label="Platform Users" value={people.users_total} icon={Users} />
        <StatCard label="Admin Users" value={people.users_admin} icon={Shield} accent="bg-[#B8956A]/10" />
      </div>
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-4">
          <p className="text-sm text-[#FFFBF5]/70">{people.note}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function OperationsSection({ media_ops, business_data }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">Media Operations</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Media Jobs" value={media_ops.jobs_total} icon={Briefcase} />
        <StatCard label="Bookings" value={media_ops.bookings_total} icon={Briefcase} />
        <StatCard label="Contacts" value={business_data.contacts} icon={Users} />
        <StatCard label="Deals" value={business_data.deals} icon={Briefcase} />
      </div>
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-4">
          <p className="text-sm text-[#FFFBF5]/70">{media_ops.note}</p>
          <div className="mt-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-emerald-400">
              Tenant Isolation: {business_data.tenant_isolation_healthy ? "Healthy" : "Degraded"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationsSection({ integrations }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">Integrations</h2>
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#B8956A]/20">
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Provider</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Type</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Status</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Purpose</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Canonical Owner</th>
                <th className="text-left p-3 text-sm font-medium text-[#FFFBF5]/60">Optional</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((i, idx) => (
                <tr key={idx} className="border-b border-[#FFFBF5]/5">
                  <td className="p-3 text-sm text-[#FFFBF5] font-medium">{i.provider}</td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70 font-mono">{i.type}</td>
                  <td className="p-3">
                    <Badge className={i.status === "connected" ? "bg-emerald-500/15 text-emerald-400 border-0" : "bg-amber-500/15 text-amber-400 border-0"}>
                      {i.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-[#FFFBF5]/70">{i.purpose}</td>
                  <td className="p-3 text-sm text-[#B8956A]">{i.canonical_owner}</td>
                  <td className="p-3">
                    {i.optional ? (
                      <Badge className="bg-blue-500/15 text-blue-400 border-0">Optional</Badge>
                    ) : (
                      <Badge className="bg-zinc-500/15 text-zinc-400 border-0">Required</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-[#FFFBF5]/50">No credentials or secrets are exposed in this view.</p>
    </div>
  );
}

function AuditSection({ audit }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-[#FFFBF5]">Audit Log</h2>
      <StatCard label="Total Logs" value={audit.total_logs} icon={FileText} />
      <Card className="bg-[#1A1A1A] border-[#B8956A]/20">
        <CardHeader><CardTitle className="text-[#FFFBF5] text-sm">Recent Activity</CardTitle></CardHeader>
        <CardContent className="p-0 max-h-96 overflow-y-auto">
          {audit.recent.map((log, i) => (
            <div key={i} className="flex items-center justify-between p-3 border-b border-[#FFFBF5]/5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#B8956A]" />
                <span className="text-sm text-[#FFFBF5] font-mono">{log.action}</span>
              </div>
              <span className="text-xs text-[#FFFBF5]/50">{new Date(log.created_date).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#FFFBF5]/50">{label}</span>
      <span className="text-sm text-[#FFFBF5] font-medium">{value}</span>
    </div>
  );
}