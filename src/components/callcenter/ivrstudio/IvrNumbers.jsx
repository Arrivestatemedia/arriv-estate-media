import React, { useEffect, useState } from "react";
import { BadgeCheck, Cable, Phone, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Pill, SectionHead, TextInput } from "./IvrUi";

export default function IvrNumbers({ data, act, refresh }) {
  const numbers = data.numbers || [];
  const flows = (data.flows || []).filter((f) => f.status === "published");
  const voices = data.voices || [];
  const [drafts, setDrafts] = useState({});
  const [confirm, setConfirm] = useState({});

  useEffect(() => {
    setDrafts(Object.fromEntries((data.numbers || []).map((n) => [n.phone_number, { ...n }])));
  }, [data.numbers]);

  const patch = (phone, changes) =>
    setDrafts((all) => ({ ...all, [phone]: { ...(all[phone] || {}), ...changes } }));

  return (
    <div className="space-y-3">
      <SectionHead
        title="Phone Numbers"
        description="Each Arriv number can run its own flow, voice, business hours and voicemail. A number only leaves the current production routing when you point it at the flow engine, and the change is confirmed against Twilio first."
      />

      {numbers.map((number) => {
        const draft = drafts[number.phone_number] || number;
        const live = draft.engine_enabled && !!draft.active_flow_key;
        return (
          <Card key={number.phone_number}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-[#B8956A]" />
                <p className="font-medium text-[#1A1A1A]">{number.phone_number}</p>
                {live ? <Pill tone="live">flow engine</Pill> : <Pill tone="neutral">existing routing</Pill>}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await act({ action: "verifyNumber", phone_number: number.phone_number });
                    if (res?.verified) await refresh();
                  }}
                >
                  <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Verify in Twilio
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await act({ action: "saveNumber", number: draft });
                    await refresh();
                  }}
                >
                  <Save className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Label">
                <TextInput value={draft.label} onChange={(v) => patch(number.phone_number, { label: v })} />
              </Field>
              <Field label="Line">
                <TextInput value={draft.line} onChange={(v) => patch(number.phone_number, { line: v })} />
              </Field>
              <Field label="Published flow">
                <select
                  value={draft.active_flow_key || ""}
                  onChange={(e) => patch(number.phone_number, { active_flow_key: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                >
                  <option value="">Current production routing</option>
                  {flows.map((f) => (
                    <option key={f.flow_key} value={f.flow_key}>
                      {f.name} (v{f.version})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Voice">
                <select
                  value={draft.voice_profile_key || ""}
                  onChange={(e) => patch(number.phone_number, { voice_profile_key: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                >
                  <option value="">Studio default</option>
                  {voices.map((v) => (
                    <option key={v.voice_key} value={v.voice_key}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Caller ID shown to staff">
                <select
                  value={draft.caller_id_mode || "public_line"}
                  onChange={(e) => patch(number.phone_number, { caller_id_mode: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                >
                  <option value="public_line">The Arriv line</option>
                  <option value="caller_number">The caller's own number</option>
                  <option value="custom">A custom number</option>
                </select>
              </Field>
              <Field label="Custom caller ID">
                <TextInput
                  value={draft.caller_id_number}
                  onChange={(v) => patch(number.phone_number, { caller_id_number: v })}
                  placeholder="+14047891107"
                />
              </Field>
              <Field label="Business hours">
                <select
                  value={draft.schedule_key || ""}
                  onChange={(e) => patch(number.phone_number, { schedule_key: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                >
                  <option value="">Always open</option>
                  {(data.schedules || []).map((s) => (
                    <option key={s.schedule_key} value={s.schedule_key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Twilio voice webhook" hint={number.last_verified_at ? `verified ${new Date(number.last_verified_at).toLocaleString()}` : "not verified yet"}>
                <p className="truncate pt-2 text-xs text-[#1A1A1A]/60">{number.twilio_voice_url || "—"}</p>
              </Field>
            </div>

            <div className="mt-3 rounded-xl border border-[#B8956A]/25 bg-[#FFFBF5] p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Go live on this number</p>
              <p className="mt-1 text-sm text-[#1A1A1A]/65">
                Binding a published flow makes the studio authoritative for new calls. Sending the webhook to Twilio is
                the moment the number actually switches. Type the confirmation text to proceed.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TextInput
                  value={confirm[number.phone_number] || ""}
                  onChange={(v) => setConfirm((c) => ({ ...c, [number.phone_number]: v }))}
                  placeholder="POINT-NUMBER-AT-ENGINE"
                  className="w-64"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await act({ action: "bindNumber", phone_number: number.phone_number, flow_key: draft.active_flow_key, enable_engine: true });
                    await refresh();
                  }}
                >
                  <Cable className="mr-1 h-3.5 w-3.5" /> Bind flow
                </Button>
                <Button
                  size="sm"
                  className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]"
                  onClick={async () => {
                    const res = await act({
                      action: "pushTwilioWebhook",
                      phone_number: number.phone_number,
                      enable: true,
                      confirm: confirm[number.phone_number],
                    });
                    if (res?.success) await refresh();
                  }}
                >
                  Point Twilio at the flow engine
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    await act({
                      action: "pushTwilioWebhook",
                      phone_number: number.phone_number,
                      enable: false,
                      confirm: confirm[number.phone_number] || "POINT-NUMBER-AT-ENGINE",
                    });
                    await refresh();
                  }}
                >
                  Return to existing routing
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}