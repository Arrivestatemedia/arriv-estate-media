import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const callCenter = (payload) =>
  base44.functions.invoke("callCenterAdmin", payload).then((r) => r?.data ?? r);

function tone(outcome) {
  if (outcome === "answered" || outcome === "completed") return "bg-[#B8956A]/15 text-[#8a6b41]";
  if (outcome === "abandoned" || outcome === "failed") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}

export default function CallHistoryPanel() {
  const [calls, setCalls] = useState([]);
  const [line, setLine] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    callCenter({ action: "listCalls", line: line === "all" ? undefined : line })
      .then((d) => setCalls(d?.calls || []))
      .catch(() => setCalls([]))
      .finally(() => setLoading(false));
  }, [line]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#1A1A1A]/60">
          Calls to the 855 and 706 lines. Earlier call history is still on the Inbound Calls page.
        </p>
        <Select value={line} onValueChange={setLine}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lines</SelectItem>
            <SelectItem value="855">855</SelectItem>
            <SelectItem value="706">706</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading calls…</p>
      ) : calls.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#1A1A1A]/50">No calls recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => (
            <Card key={call.id} className="border-[#B8956A]/20 bg-white">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">
                    {call.caller_name || call.from_number || "Unknown caller"}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/50">
                    to {call.receiving_line || "—"} · {call.caller_type || "unknown"} · {call.route || "—"}
                    {call.duration_seconds ? ` · ${call.duration_seconds}s` : ""}
                    {call.started_at ? ` · ${new Date(call.started_at).toLocaleString()}` : ""}
                  </p>
                  {call.speech_text ? (
                    <p className="mt-1 truncate text-xs italic text-[#1A1A1A]/40">“{call.speech_text}”</p>
                  ) : null}
                </div>
                <Badge className={tone(call.outcome)}>{call.outcome || "in progress"}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}