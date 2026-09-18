import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, X, UserCheck, Search, Trash2 } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const MUTED_LIGHT = "rgba(26,26,26,0.35)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "12px",
};

export default function IdentityMatchingQueue({ tenantId, onResolved, onClose }) {
  const [staging, setStaging] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedStaging, setSelectedStaging] = useState(null);
  const [resolving, setResolving] = useState(false);

  const loadStaging = async () => {
    try {
      const res = await base44.entities.PerformanceIngestionStaging.filter({ status: "needs_matching" }, "-created_date", 50);
      const list = res?.data ?? res;
      setStaging(Array.isArray(list) ? list : []);
    } catch { setStaging([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadStaging(); }, []);

  const searchCandidates = async (query) => {
    if (!query.trim()) { setCandidates([]); return; }
    setSearching(true);
    try {
      const res = await base44.entities.HireCandidate.list("-created_date", 200);
      const all = res?.data ?? res;
      const q = query.toLowerCase();
      const filtered = (Array.isArray(all) ? all : []).filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      ).slice(0, 10);
      setCandidates(filtered);
    } catch { setCandidates([]); }
    finally { setSearching(false); }
  };

  const handleResolve = async (stagingId, candidateId) => {
    setResolving(true);
    try {
      await base44.functions.invoke("resolvePerformanceIdentity", {
        staging_id: stagingId,
        candidate_id: candidateId,
        action: "resolve",
      });
      setSelectedStaging(null);
      setCandidates([]);
      setSearch("");
      await loadStaging();
      onResolved?.();
    } catch (e) {
      alert("Failed to resolve: " + (e.message || "unknown error"));
    } finally {
      setResolving(false);
    }
  };

  const handleDiscard = async (stagingId) => {
    if (!window.confirm("Discard this record? The data will not be imported.")) return;
    try {
      await base44.functions.invoke("resolvePerformanceIdentity", {
        staging_id: stagingId,
        action: "discard",
      });
      await loadStaging();
      onResolved?.();
    } catch (e) {
      alert("Failed to discard: " + (e.message || "unknown error"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose} style={{ backdropFilter: "blur(4px)" }}>
      <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" style={{ ...whiteCard, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Identity Matching Queue</h3>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>{staging.length} record{staging.length !== 1 ? "s" : ""} need matching</p>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: MUTED }}><X className="w-5 h-5" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: MUTED }} /></div>
        ) : staging.length === 0 ? (
          <div className="text-center py-10">
            <UserCheck className="w-10 h-10 mx-auto mb-2" style={{ color: MUTED_LIGHT }} />
            <p className="text-sm" style={{ color: MUTED }}>All records have been matched.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {staging.map(record => (
              <div key={record.id} className="p-4 rounded-lg" style={{ border: "1px solid rgba(184,149,106,0.15)", backgroundColor: "#FFFFFF" }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: TEXT_DARK }}>
                      {record.identity_hints?.email || record.identity_hints?.external_employee_id || "Unknown identity"}
                    </p>
                    {record.potential_matches?.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                        {record.potential_matches.length} potential match{record.potential_matches.length !== 1 ? "es" : ""} found
                      </p>
                    )}
                  </div>
                  <button onClick={() => handleDiscard(record.id)} className="p-1 rounded shrink-0" style={{ color: "#DC2626" }} title="Discard">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Raw payload preview */}
                <div className="text-xs p-2 rounded mb-3 max-h-24 overflow-y-auto" style={{ backgroundColor: "rgba(26,26,26,0.04)", color: MUTED, fontFamily: "monospace" }}>
                  {JSON.stringify(record.raw_payload?.metrics || record.raw_payload, null, 1).slice(0, 200)}
                </div>

                {/* Potential matches */}
                {record.potential_matches?.length > 0 && !selectedStaging && (
                  <div className="space-y-1 mb-2">
                    <p className="text-xs font-medium" style={{ color: MUTED }}>Suggested matches:</p>
                    {record.potential_matches.map(match => (
                      <button
                        key={match.candidate_id}
                        onClick={() => handleResolve(record.id, match.candidate_id)}
                        disabled={resolving}
                        className="w-full text-left p-2 rounded-lg text-sm flex items-center justify-between transition-colors"
                        style={{ backgroundColor: "rgba(184,149,106,0.06)", border: "1px solid rgba(184,149,106,0.15)" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.12)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.06)"; }}
                      >
                        <span style={{ color: TEXT_DARK }}>{match.name} <span style={{ color: MUTED }}>({match.email})</span></span>
                        <UserCheck className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      </button>
                    ))}
                  </div>
                )}

                {/* Manual search */}
                {selectedStaging === record.id ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Search className="w-3.5 h-3.5" style={{ color: MUTED }} />
                      <input
                        autoFocus
                        value={search}
                        onChange={e => { setSearch(e.target.value); searchCandidates(e.target.value); }}
                        placeholder="Search candidates by name or email..."
                        className="flex-1 text-sm px-2 py-1.5 rounded-lg"
                        style={{ border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }}
                      />
                      <button onClick={() => { setSelectedStaging(null); setSearch(""); setCandidates([]); }} className="text-xs px-2 py-1.5 rounded" style={{ color: MUTED }}>Cancel</button>
                    </div>
                    {searching && <Loader2 className="w-4 h-4 animate-spin" style={{ color: GOLD }} />}
                    {candidates.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleResolve(record.id, c.id)}
                        disabled={resolving}
                        className="w-full text-left p-2 rounded-lg text-sm flex items-center justify-between transition-colors"
                        style={{ backgroundColor: "rgba(184,149,106,0.06)", border: "1px solid rgba(184,149,106,0.15)" }}
                      >
                        <span style={{ color: TEXT_DARK }}>{c.name} <span style={{ color: MUTED }}>({c.email})</span></span>
                        <UserCheck className="w-3.5 h-3.5" style={{ color: GOLD }} />
                      </button>
                    ))}
                    {search && !searching && candidates.length === 0 && (
                      <p className="text-xs text-center py-2" style={{ color: MUTED_LIGHT }}>No candidates found</p>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedStaging(record.id)}
                    className="text-xs font-medium"
                    style={{ color: GOLD }}
                  >
                    Search manually →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}