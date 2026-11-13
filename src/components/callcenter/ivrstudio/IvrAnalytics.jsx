import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, Empty, SectionHead } from "./IvrUi";

export default function IvrAnalytics({ data, act }) {
  const [calls, setCalls] = useState(null);
  const [open, setOpen] = useState(null);
  const [line, setLine] = useState("");

  useEffect(() => {
    act({ action: "callTraces", line }).then((res) => setCalls(res?.calls || []));
  }, [line]);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Call History & Analytics"
        description="Each call with the flow version it used, the nodes it passed through and the recognition rule that fired — the same trace the diagnostics panel shows before publishing."
        right={
          <select
            value={line}
            onChange={(e) => setLine(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="">All lines</option>
            <option value="855">855 line</option>
            <option value="706">706 line</option>
          </select>
        }
      />

      {calls === null ? <Empty>Loading calls…</Empty> : null}
      {calls && !calls.length ? <Empty>No calls recorded yet.</Empty> : null}

      <div className="space-y-2">
        {(calls || []).map((call) => {
          const events = Array.isArray(call.events) ? call.events : [];
          const trace = events.filter((e) => ["ivr_node", "ivr_selection", "ivr_speech", "caller_rule", "emergency_override", "ashley", "callback_requested", "ivr_sms", "ivr_error"].includes(e.type));
          const expanded = open === call.id;
          return (
            <Card key={call.id} className="py-3">
              <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(expanded ? null : call.id)}>
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {call.caller_name || call.from_number || "Unknown caller"}
                    <span className="ml-2 text-xs text-[#1A1A1A]/45">
                      {call.started_at ? new Date(call.started_at).toLocaleString() : ""}
                    </span>
                  </p>
                  <p className="text-xs text-[#1A1A1A]/55">
                    {call.receiving_line ? `line ${call.receiving_line} · ` : ""}
                    {call.route || "route unknown"} · {call.outcome || "in progress"}
                    {call.stage ? ` · at ${call.stage}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#1A1A1A]/45">
                  {call.duration_seconds ? `${Math.round(call.duration_seconds)}s` : ""}
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>
              {expanded ? (
                <div className="mt-2 space-y-1">
                  {trace.length ? (
                    trace.map((event, i) => (
                      <p key={i} className="rounded-lg bg-[#FFFBF5] px-2 py-1 text-xs text-[#1A1A1A]/70">
                        <span className="mr-2 uppercase tracking-wide text-[#B8956A]">{event.type}</span>
                        {event.note}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-[#1A1A1A]/45">
                      This call ran on the existing production routing, so no flow trace exists for it.
                    </p>
                  )}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}