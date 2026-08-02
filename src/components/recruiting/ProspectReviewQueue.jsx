import React, { useState, useEffect } from "react";
import { listProspects, saveProspect, dismissProspect, approveProspect } from "@/lib/recruitingApi";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Bookmark, ExternalLink, MapPin, Building2, Search } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const STATUS_FILTERS = ["new", "saved", "approved", "dismissed", "converted"];

function ProspectCard({ prospect, onAction, onView }) {
  const [acting, setActing] = useState(false);
  const handle = async (fn) => { setActing(true); try { await fn(); onAction(); } finally { setActing(false); }; };

  return (
    <div className="p-4 rounded-xl transition-all" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <button onClick={() => onView(prospect)} className="text-left">
            <h3 className="font-bold text-base hover:underline" style={{ ...SERIF, color: CREAM }}>{prospect.full_name}</h3>
          </button>
          <p className="text-sm" style={{ color: "rgba(255,251,245,0.6)" }}>{prospect.current_title}</p>
          <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgba(255,251,245,0.4)" }}>
            {prospect.current_company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {prospect.current_company}</span>}
            {prospect.public_location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {prospect.public_location}</span>}
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-medium capitalize shrink-0 ml-2"
          style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>{prospect.status}</span>
      </div>

      {prospect.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {prospect.skills.slice(0, 5).map((s, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,251,245,0.06)", color: "rgba(255,251,245,0.6)" }}>{s}</span>
          ))}
        </div>
      )}

      {prospect.source_url && (
        <a href={prospect.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mb-3 hover:underline" style={{ color: GOLD }}>
          <ExternalLink className="w-3 h-3" /> View source
        </a>
      )}

      <div className="flex gap-2 pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.1)" }}>
        {prospect.status === "new" && (
          <>
            <Button size="sm" disabled={acting} onClick={() => handle(() => saveProspect(prospect.id))} className="flex-1" style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>
              <Bookmark className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
            <Button size="sm" disabled={acting} onClick={() => handle(() => dismissProspect(prospect.id))} variant="outline" className="flex-1 border-gray-600 text-gray-300">
              <X className="w-3.5 h-3.5 mr-1" /> Dismiss
            </Button>
          </>
        )}
        {prospect.status === "saved" && (
          <Button size="sm" disabled={acting} onClick={() => handle(() => approveProspect(prospect.id))} className="flex-1" style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>
            <Check className="w-3.5 h-3.5 mr-1" /> Approve
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onView(prospect)} className="text-gray-300">Details</Button>
      </div>
    </div>
  );
}

export default function ProspectReviewQueue({ refreshKey, onSelectProspect }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("new");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listProspects({ status: statusFilter === "all" ? undefined : statusFilter, limit: 100 });
      setProspects(data.prospects || []);
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [statusFilter, refreshKey]);

  const filtered = prospects.filter((p) =>
    !search || p.full_name?.toLowerCase().includes(search.toLowerCase()) || p.current_title?.toLowerCase().includes(search.toLowerCase()) || p.current_company?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 flex-wrap">
          {["all", ...STATUS_FILTERS].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors"
              style={{ backgroundColor: statusFilter === s ? GOLD : "rgba(26,26,26,0.05)", color: statusFilter === s ? "#1A1A1A" : MUTED, border: "1px solid rgba(184,149,106,0.2)" }}>
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospects..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#B8956A]"
            style={{ borderColor: "rgba(184,149,106,0.2)", color: TEXT_DARK }} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-medium text-lg" style={{ color: TEXT_DARK }}>No prospects found</p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>Run a search from the Chat tab to find new candidates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => <ProspectCard key={p.id} prospect={p} onAction={load} onView={onSelectProspect} />)}
        </div>
      )}
    </div>
  );
}