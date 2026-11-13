import React from "react";
import { AlertTriangle, CheckCircle2, Phone, ShieldAlert } from "lucide-react";
import { Card, Pill, SectionHead } from "./IvrUi";

export default function IvrOverview({ data, go }) {
  const flows = data.flows || [];
  const numbers = data.numbers || [];
  const published = flows.filter((f) => f.status === "published");
  const liveNumbers = numbers.filter((n) => n.engine_enabled && n.active_flow_key);
  const emergency = data.emergency;
  const rules = data.rules || [];

  const tiles = [
    { label: "Published flows", value: published.length, tone: "live" },
    { label: "Draft flows", value: flows.length - published.length, tone: "warn" },
    { label: "Numbers on the flow engine", value: liveNumbers.length, tone: "info" },
    { label: "Recognition rules", value: rules.length, tone: "gold" },
  ];

  return (
    <div className="space-y-4">
      <SectionHead
        title="Arriv Call Center"
        description="Every greeting, menu, route, voice and recognition rule that runs on the 855 and 706 lines, editable without touching code or republishing the app."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/45">{tile.label}</p>
            <p className="mt-2 font-serif text-3xl text-[#1A1A1A]">{tile.value}</p>
            <Pill tone={tile.tone}>{tile.label === "Draft flows" ? "not live yet" : "in the studio"}</Pill>
          </Card>
        ))}
      </div>

      {emergency?.active ? (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <p className="text-sm font-medium text-red-800">Emergency override is ON — {emergency.mode}</p>
              <p className="text-sm text-red-700/80">
                {emergency.target_number ? `Calls go to ${emergency.target_number}. ` : ""}
                {emergency.reason || "No reason recorded."} Activated by {emergency.activated_by || "an administrator"}.
              </p>
              <button className="mt-2 text-sm font-medium text-red-800 underline" onClick={() => go("emergency")}>
                Review and restore
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <SectionHead title="Lines" description="What each Arriv number answers with right now." />
        <div className="space-y-2">
          {numbers.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/50">No numbers are configured yet — import your configuration first.</p>
          ) : null}
          {numbers.map((number) => {
            const flow = flows.find((f) => f.flow_key === number.active_flow_key);
            const live = number.engine_enabled && flow?.status === "published";
            return (
              <div
                key={number.phone_number}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B8956A]/20 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-[#B8956A]" />
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{number.label || number.phone_number}</p>
                    <p className="text-xs text-[#1A1A1A]/50">{number.phone_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {live ? (
                    <Pill tone="live">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> {flow?.name}
                    </Pill>
                  ) : (
                    <Pill tone="neutral">
                      <AlertTriangle className="mr-1 h-3 w-3" /> existing production routing
                    </Pill>
                  )}
                  <button className="text-xs text-[#8a6a44] underline" onClick={() => go("numbers")}>
                    Manage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <SectionHead title="Change something" description="The two edits administrators make most often." />
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg bg-[#1A1A1A] px-3 py-2 text-sm text-[#FFFBF5]" onClick={() => go("builder")}>
              Open the flow builder
            </button>
            <button
              className="rounded-lg border border-[#B8956A]/40 px-3 py-2 text-sm text-[#8a6a44]"
              onClick={() => go("rules")}
            >
              Caller recognition rules
            </button>
            <button
              className="rounded-lg border border-[#B8956A]/40 px-3 py-2 text-sm text-[#8a6a44]"
              onClick={() => go("testing")}
            >
              Test before publishing
            </button>
          </div>
        </Card>
        <Card>
          <SectionHead title="How publishing works" />
          <ol className="list-decimal space-y-1 pl-4 text-sm text-[#1A1A1A]/65">
            <li>Saving edits only changes the draft — live calls are untouched.</li>
            <li>Publishing validates the flow, then snapshots the version.</li>
            <li>New calls use the published version immediately; no app republish.</li>
            <li>Calls already in progress stay on the version they started on.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}