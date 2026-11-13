import { useEffect, useState } from "react";
import { callCenter } from "./callCenterClient";
import StatCard from "./StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function outcomeTone(outcome) {
  if (outcome === "answered" || outcome === "completed") return "bg-[#B8956A]/15 text-[#8a6b41]";
  if (outcome === "abandoned" || outcome === "failed") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

export default function OverviewPanel() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    callCenter({ action: "overview" })
      .then((payload) => {
        if (payload?.error) throw new Error(payload.error);
        setData(payload);
      })
      .catch((e) => setError(e?.response?.data?.error || e.message || "Could not load call activity"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading call activity…</p>;
  }
  if (error) {
    return <p className="py-10 text-center text-sm text-red-600">{error}</p>;
  }
  if (!data?.overview) {
    return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">No call activity yet.</p>;
  }

  const o = data.overview;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Inbound calls" value={o.total_calls} />
        <StatCard label="Answered" value={o.answered} />
        <StatCard label="Missed" value={o.abandoned} />
        <StatCard label="Pending callbacks" value={o.pending_callbacks} />
        <StatCard label="Unreviewed voicemails" value={o.unreviewed_voicemails} />
        <StatCard label="Open support issues" value={o.open_issues} />
        <StatCard label="AI bookings" value={o.ai_bookings} hint="Booked by Ashley" />
        <StatCard
          label="Answer rate"
          value={o.total_calls ? `${Math.round((o.answered / o.total_calls) * 100)}%` : "—"}
        />
      </div>

      <Card className="border-[#B8956A]/25 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg text-[#1A1A1A]">Recent calls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.recent_calls || []).length === 0 ? (
            <p className="py-4 text-sm text-[#1A1A1A]/50">No calls recorded yet.</p>
          ) : (
            data.recent_calls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#B8956A]/15 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">
                    {call.caller_name || call.from_number || "Unknown caller"}
                  </p>
                  <p className="truncate text-xs text-[#1A1A1A]/50">
                    {call.receiving_line ? `${call.receiving_line} line · ` : ""}
                    {call.route || "—"}
                    {call.started_at ? ` · ${new Date(call.started_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <Badge className={`shrink-0 ${outcomeTone(call.outcome)}`}>{call.outcome || "in progress"}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}