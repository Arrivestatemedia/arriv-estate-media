import React, { useState, useEffect } from "react";
import { Save, X, Check, ExternalLink, MapPin, Briefcase, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listProspects, saveProspect, dismissProspect, approveProspect } from "@/lib/recruitingApi";
import { toast } from "sonner";

const STATUS_FILTERS = [
  { value: "new", label: "New" },
  { value: "saved", label: "Saved" },
  { value: "approved", label: "Approved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
];

export default function ProspectReviewQueue({ onSelectProspect }) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("new");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await listProspects({ status: statusFilter, limit: 200 });
      setProspects(res.prospects || []);
    } catch (e) {
      toast.error("Failed to load prospects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleSave = async (id) => {
    try {
      await saveProspect(id);
      toast.success("Prospect saved");
      load();
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  const handleDismiss = async (id) => {
    try {
      await dismissProspect(id);
      toast.success("Prospect dismissed");
      load();
    } catch (e) {
      toast.error("Failed to dismiss");
    }
  };

  const handleApprove = async (id) => {
    try {
      await approveProspect(id);
      toast.success("Prospect approved for outreach");
      load();
    } catch (e) {
      toast.error("Failed to approve");
    }
  };

  const filtered = prospects.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q) ||
      (p.company || "").toLowerCase().includes(q) ||
      (p.location || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5]">
      <div className="sticky top-0 bg-white border-b border-[#B8956A]/20 px-6 py-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-[#1A1A1A]">Prospect Review Queue</h1>
          <span className="text-sm text-[#1A1A1A]/50">{filtered.length} prospects</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B8956A]" />
            <Input
              placeholder="Search by name, title, company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? "bg-[#B8956A] text-white"
                    : "bg-[#FFFBF5] text-[#1A1A1A]/70 border border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Filter className="w-10 h-10 text-[#B8956A]/30 mb-3" />
            <p className="text-[#1A1A1A] font-medium">No prospects found</p>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">
              {statusFilter === "new"
                ? "Run an AI search to find new candidates"
                : `No prospects with status "${statusFilter}"`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-xl border border-[#B8956A]/20 p-4 hover:border-[#B8956A]/40 transition-colors"
              >
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => onSelectProspect?.(p.id)}
                >
                  <div className="w-11 h-11 rounded-full bg-[#B8956A]/15 flex items-center justify-center shrink-0">
                    <span className="text-base font-semibold text-[#B8956A]">
                      {(p.name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1A1A1A] truncate">{p.name}</p>
                    <p className="text-sm text-[#1A1A1A]/60 truncate">{p.title}</p>
                    <p className="text-xs text-[#1A1A1A]/50 truncate">{p.company}</p>
                  </div>
                </div>

                {p.location && (
                  <div className="flex items-center gap-1 mt-3 text-xs text-[#1A1A1A]/50">
                    <MapPin className="w-3 h-3" />
                    {p.location}
                  </div>
                )}

                {p.skills && p.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.skills.slice(0, 3).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-[#FFFBF5] text-[#1A1A1A]/60 border border-[#B8956A]/15">
                        {s}
                      </span>
                    ))}
                    {p.skills.length > 3 && (
                      <span className="px-2 py-0.5 text-xs text-[#1A1A1A]/40">+{p.skills.length - 3}</span>
                    )}
                  </div>
                )}

                {p.source_url && (
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 mt-2 text-xs text-[#B8956A] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Source
                  </a>
                )}

                {/* Actions */}
                <div className="flex gap-1.5 mt-4 pt-3 border-t border-[#B8956A]/10">
                  {p.status === "new" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleSave(p.id)}
                        className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
                      >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDismiss(p.id)}
                        className="border-[#B8956A]/20 text-[#1A1A1A]/60 hover:bg-[#B8956A]/10"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                  {p.status === "saved" && (
                    <Button
                      size="sm"
                      onClick={() => handleApprove(p.id)}
                      className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      Approve for Outreach
                    </Button>
                  )}
                  {p.status === "approved" && (
                    <span className="text-xs text-[#B8956A] font-medium py-2">
                      {p.outreach_status === "pending_approval" ? "Pending approval" : "Approved"}
                    </span>
                  )}
                  {(p.status === "dismissed" || p.status === "contacted" || p.status === "converted") && (
                    <span className="text-xs text-[#1A1A1A]/50 py-2 capitalize">{p.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}