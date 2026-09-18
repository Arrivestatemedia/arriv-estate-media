import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Link2, XCircle } from "lucide-react";
import { toast } from "sonner";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
};

export default function IdentityMatchingQueue({ tenantId, onResolved }) {
  const [staged, setStaged] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState({});

  const load = async () => {
    try {
      const tid = tenantId || "tnt_estate_media";
      const res = await base44.entities.PerformanceIngestionStaging.filter({ tenant_id: tid, status: "needs_matching" }, "-created_date", 50);
      const data = res?.data ?? res ?? [];
      setStaged(Array.isArray(data) ? data : []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const searchCandidates = async (query) => {
    if (!query || query.length < 2) { setCandidates([]); return; }
    try {
      const res = await base44.entities.HireCandidate.filter({ full_name: query }, "-created_date", 10);
      const data = res?.data ?? res ?? [];
      setCandidates(Array.isArray(data) ? data : []);
    } catch (_) { setCandidates([]); }
  };

  const handleResolve = async (item) => {
    const candidateId = selectedCandidate[item.id];
    if (!candidateId) { toast.error("Select a candidate first"); return; }
    setResolving(item.id);
    try {
      await base44.functions.invoke("resolvePerformanceIdentity", {
        staging_id: item.id,
        tenant_id: tenantId,
        resolution: { candidate_id: candidateId },
      });
      toast.success("Identity resolved");
      setSelectedCandidate(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      load();
      onResolved?.();
    } catch (e) {
      toast.error("Failed to resolve");
    }
    setResolving(null);
  };

  const handleReject = async (item) => {
    try {
      await base44.entities.PerformanceIngestionStaging.update(item.id, { status: "rejected", resolved_at: new Date().toISOString() });
      toast.success("Record rejected");
      load();
      onResolved?.();
    } catch (_) { toast.error("Failed to reject"); }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" style={{ color: GOLD }} /></div>;

  if (staged.length === 0) {
    return <div className="p-4 text-center text-sm" style={{ ...card, color: MUTED_LIGHT }}>No records need matching.</div>;
  }

  return (
    <div className="space-y-3">
      {staged.map(item => {
        const hints = item.identity_hints || {};
        const payload = item.raw_payload || {};
        const metrics = payload.metrics || {};
        return (
          <div key={item.id} className="p-4" style={card}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold" style={{ ...SERIF, color: CREAM }}>
                  {hints.email || hints.external_employee_id || "Unknown identity"}
                </p>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>
                  Source: {item.source_id?.slice(0, 12)}...
                </p>
              </div>
              <button onClick={() => handleReject(item)} className="p-1 rounded hover:bg-white/5">
                <XCircle className="w-4 h-4" style={{ color: "rgba(239,68,68,0.6)" }} />
              </button>
            </div>

            <div className="mb-3 p-2 rounded text-xs" style={{ backgroundColor: "#0A0A0A", ...MONO, fontSize: "11px", color: CREAM }}>
              {Object.keys(metrics).length > 0 ? (
                Object.entries(metrics).map(([k, v]) => <div key={k}><span style={{ color: GOLD }}>{k}:</span> {String(v)}</div>)
              ) : (
                <pre style={{ fontSize: "10px" }}>{JSON.stringify(payload, null, 2)}</pre>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs" style={{ color: MUTED_LIGHT }}>Link to candidate</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search candidate name..."
                  value={search[item.id] || ""}
                  onChange={e => {
                    setSearch(prev => ({ ...prev, [item.id]: e.target.value }));
                    searchCandidates(e.target.value);
                  }}
                  className="text-xs"
                  style={{ backgroundColor: "#0A0A0A", borderColor: "rgba(184,149,106,0.2)", color: CREAM }}
                />
                <Button size="sm" onClick={() => handleResolve(item)} disabled={resolving === item.id} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
                  {resolving === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
                  Link
                </Button>
              </div>
              {candidates.length > 0 && (search[item.id] || "").length >= 2 && (
                <div className="max-h-32 overflow-y-auto rounded border" style={{ borderColor: "rgba(184,149,106,0.2)" }}>
                  {candidates.map(c => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCandidate(prev => ({ ...prev, [item.id]: c.id }));
                        setSearch(prev => ({ ...prev, [item.id]: c.full_name || c.email }));
                        setCandidates([]);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/5"
                      style={{ color: CREAM, borderBottom: "1px solid rgba(184,149,106,0.1)" }}
                    >
                      {c.full_name || c.email} {c.email && <span style={{ color: MUTED_LIGHT }}>· {c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
              {selectedCandidate[item.id] && (
                <p className="text-xs" style={{ color: GOLD }}>✓ Candidate selected</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}