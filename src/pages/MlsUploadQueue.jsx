import React, { useCallback, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ShieldCheck, RefreshCw, Clock, AlertTriangle, ExternalLink, Youtube, ImageIcon, Video, MapPin } from "lucide-react";
import MlsRequestDetail from "@/components/mls/MlsRequestDetail";
import MlsServiceAreasPanel from "@/components/mls/MlsServiceAreasPanel";
import BrightConnectionTest from "@/components/mls/BrightConnectionTest";

const PROVIDER_LABEL = {
  fmls: "FMLS",
  georgia_mls: "Georgia MLS",
  bright_mls: "Bright MLS",
  unresolved: "Provider needed",
};

const STATUS_LABEL = {
  submitted: "Submitted",
  processing: "Processing",
  photos_uploaded: "Photos uploaded",
  video_added: "Video added",
  completed: "Completed",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
};

const FILTERS = [
  { id: "open", label: "Open" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

/**
 * MlsUploadQueue
 * The administrative queue for every Publish to MLS request: what is due, what is overdue, and the
 * exact media each request contains. Opening a row gives the administrator the photo package and
 * the YouTube links needed to complete the upload in FMLS Matrix.
 */
export default function MlsUploadQueue() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState("queue");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getMlsUploadRequests", { mode: "admin", status: "all" });
      const payload = res?.data || res;
      if (payload?.error) throw new Error(payload.error);
      setData(payload);
    } catch (err) {
      setError(err.message || "Could not load the MLS queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const requests = data?.requests || [];

  const visible = useMemo(() => {
    if (filter === "all") return requests;
    if (filter === "open") return requests.filter((r) => r.open);
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const stats = useMemo(() => ({
    open: requests.filter((r) => r.open).length,
    overdue: requests.filter((r) => r.is_overdue).length,
    attention: requests.filter((r) => r.status === "needs_attention").length,
    completed: requests.filter((r) => r.status === "completed").length,
  }), [requests]);

  const handleUpdated = () => { load(); setSelected(null); };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-serif text-[#1A1A1A] flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#B8956A]" /> MLS Upload Queue
        </h1>
        <p className="text-sm text-[#1A1A1A]/55 mt-1">
          Customer-requested media uploads. {data?.window_label ? `Service window: ${data.window_label}.` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { id: "queue", label: "Queue" },
          { id: "areas", label: "Service areas" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              view === tab.id ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-white text-[#1A1A1A]/60 border border-[#B8956A]/20 hover:bg-[#B8956A]/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {view === "queue" && <BrightConnectionTest />}
        {view === "queue" && (
          <Button variant="outline" onClick={load} className="border-[#B8956A]/40 text-[#8a6d4a]">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        )}
      </div>
    </div>
  );

  if (view === "areas") {
    return (
      <div className="min-h-screen bg-[#FFFBF5]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {header}
          <MlsServiceAreasPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {header}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {[
            { label: "Open", value: stats.open, icon: Clock, tone: "text-[#8a6d4a]" },
            { label: "Overdue", value: stats.overdue, icon: AlertTriangle, tone: "text-red-600" },
            { label: "Needs attention", value: stats.attention, icon: AlertTriangle, tone: "text-amber-700" },
            { label: "Completed", value: stats.completed, icon: ShieldCheck, tone: "text-[#1A1A1A]/60" },
          ].map(({ label, value, icon: Icon, tone }) => (
            <Card key={label} className="p-3">
              <p className="text-[11px] uppercase tracking-wide text-[#1A1A1A]/40 flex items-center gap-1">
                <Icon className="w-3 h-3" /> {label}
              </p>
              <p className={`text-xl font-semibold ${tone}`}>{value}</p>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f.id ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-white text-[#1A1A1A]/60 border border-[#B8956A]/20 hover:bg-[#B8956A]/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-sm text-[#1A1A1A]/50">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading requests...
          </div>
        ) : error ? (
          <Card className="p-4 text-sm text-red-700 bg-red-50 border-red-200">{error}</Card>
        ) : visible.length === 0 ? (
          <Card className="p-10 text-center">
            <ShieldCheck className="w-8 h-8 text-[#B8956A]/40 mx-auto mb-2" />
            <p className="text-sm text-[#1A1A1A]/60">Nothing here right now.</p>
            <p className="text-xs text-[#1A1A1A]/40 mt-1">Requests appear as soon as a customer clicks Publish to MLS in their gallery.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {visible.map((r) => (
              <Card
                key={r.request_id}
                className={`p-3 hover:border-[#B8956A]/50 cursor-pointer transition-colors ${r.is_overdue ? "border-red-200" : "border-[#B8956A]/20"}`}
                onClick={() => setSelected(r)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">{r.property_address || "Property"}</p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[#B8956A]/15 text-[#8a6d4a]">
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1A1A1A]/5 text-[#1A1A1A]/60">
                        {PROVIDER_LABEL[r.provider] || r.provider}
                      </span>
                      {r.is_overdue && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-50 text-red-600">Overdue</span>
                      )}
                    </div>
                    <p className="text-xs text-[#1A1A1A]/50 mt-0.5">
                      {r.mls_number ? `MLS #${r.mls_number}` : (r.region_label || "Provider to be assigned")}
                      {" · "}{r.client_name || r.client_email}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#1A1A1A]/50">
                    <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {r.photo_count || 0}</span>
                    <span className="flex items-center gap-1"><Video className="w-3 h-3" /> {r.video_count || 0}</span>
                    <span className="flex items-center gap-1 text-[#8a6d4a] font-medium"><Clock className="w-3 h-3" /> {r.deadline_label}</span>
                    {r.job_id && (
                      <Link
                        to={`/JobDetail?job_id=${r.job_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" /> Job
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#1A1A1A]/35 mt-6 flex items-center gap-1.5">
          <Youtube className="w-3 h-3" />
          Unbranded videos are hosted on Arriv's YouTube channel as unlisted links; FMLS receives the URL, not a file.
        </p>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#B8956A]" /> MLS upload request
            </DialogTitle>
          </DialogHeader>
          {selected && <MlsRequestDetail request={selected} onUpdated={handleUpdated} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}