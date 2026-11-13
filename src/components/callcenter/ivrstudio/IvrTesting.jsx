import React, { useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, Pill, SectionHead, TextInput } from "./IvrUi";

export default function IvrTesting({ data, act }) {
  const flows = data.flows || [];
  const schedules = data.schedules || [];
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const [callerNumber, setCallerNumber] = useState("+15555550100");
  const [dialedNumber, setDialedNumber] = useState(data.numbers?.[0]?.phone_number || "+18557654306");
  const [callerType, setCallerType] = useState("public");
  const [applicant, setApplicant] = useState("");
  const [keypad, setKeypad] = useState("1");
  const [scheduleKey, setScheduleKey] = useState(schedules[0]?.schedule_key || "");
  const [result, setResult] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);

  if (!flows.length) return <Empty>Import your configuration first to test a flow.</Empty>;

  const run = async () => {
    const res = await act({
      action: "simulate",
      flow_key: flowKey,
      caller_number: callerNumber,
      dialed_number: dialedNumber,
      caller_type: callerType,
      applicant_status: applicant,
      schedule_key: scheduleKey,
      keypad: keypad.split("").filter((c) => c.trim()),
    });
    if (!res?.error) setResult(res);
  };

  const check = async () => {
    const res = await act({ action: "diagnostics", flow_key: flowKey });
    if (!res?.error) setDiagnostics(res);
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Testing & Diagnostics"
        description="Walk a call through the flow without dialing. Every step is shown, so a missing destination or a loop is obvious before a caller finds it."
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={check}>
              Run diagnostics
            </Button>
            <Button size="sm" className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" onClick={run}>
              <Play className="mr-1 h-3.5 w-3.5" /> Simulate call
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Flow">
            <select
              value={flowKey}
              onChange={(e) => setFlowKey(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {flows.map((f) => (
                <option key={f.flow_key} value={f.flow_key}>
                  {f.name} ({f.status})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Caller number">
            <TextInput value={callerNumber} onChange={setCallerNumber} />
          </Field>
          <Field label="Dialed number">
            <TextInput value={dialedNumber} onChange={setDialedNumber} />
          </Field>
          <Field label="Recognised as">
            <select
              value={callerType}
              onChange={(e) => setCallerType(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {["public", "client", "b2b_client", "media_specialist", "prospect", "owner_admin", "unknown"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Applicant status" hint="Leave blank for a non-applicant">
            <TextInput value={applicant} onChange={setApplicant} placeholder="applicant" />
          </Field>
          <Field label="Business hours">
            <select
              value={scheduleKey}
              onChange={(e) => setScheduleKey(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">No schedule</option>
              {schedules.map((s) => (
                <option key={s.schedule_key} value={s.schedule_key}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Keypad presses" hint="For example 1 then 3 → 13">
            <TextInput value={keypad} onChange={setKeypad} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Call trace</p>
          {!result ? (
            <p className="text-sm text-[#1A1A1A]/45">Run a simulation to see every node the call passes through.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#1A1A1A]/75">
                <span className="font-medium">Outcome:</span> {result.result}
              </p>
              {result.matched_rule ? (
                <Pill tone="gold">Recognition rule matched: {result.matched_rule.name}</Pill>
              ) : null}
              <ol className="space-y-1">
                {(result.trace || []).map((step, i) => (
                  <li key={i} className="rounded-lg border border-[#B8956A]/20 px-2 py-1.5 text-sm">
                    <span className="mr-2 text-xs text-[#B8956A]">{i + 1}</span>
                    <span className="font-medium text-[#1A1A1A]">{step.label}</span>
                    <span className="ml-2 text-[#1A1A1A]/55">{step.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>

        <Card>
          <p className="mb-2 flex items-center gap-1 text-sm font-medium text-[#1A1A1A]">
            <FlaskConical className="h-4 w-4" /> Diagnostics
          </p>
          {!diagnostics ? (
            <p className="text-sm text-[#1A1A1A]/45">
              Diagnostics flag missing destinations, unreachable nodes, loops, unconfigured transfers and invalid
              webhook URLs.
            </p>
          ) : diagnostics.issues?.length ? (
            <ul className="space-y-1">
              {diagnostics.issues.map((issue, i) => (
                <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
                  <span className="mr-1 font-medium uppercase">{issue.severity}</span> {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <Pill tone="live">No problems found in this flow.</Pill>
          )}
          <p className="mt-3 text-xs text-[#1A1A1A]/45">
            Simulation uses the saved draft. Publishing is a separate, deliberate step.
          </p>
        </Card>
      </div>
    </div>
  );
}