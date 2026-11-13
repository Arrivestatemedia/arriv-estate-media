import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Pill, SectionHead, TextInput, Toggle } from "./IvrUi";

export default function IvrGlobal({ data, act, refresh }) {
  const [draft, setDraft] = useState(data.settings || {});
  const [audit, setAudit] = useState([]);

  useEffect(() => setDraft(data.settings || {}), [data.settings]);
  useEffect(() => {
    act({ action: "audit", limit: 40 }).then((res) => setAudit(res?.entries || []));
  }, [data.flows, data.numbers]);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Global Settings"
        description="Numbers, notifications and safety limits shared by every line. Credentials stay on the server; nothing here exposes them."
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Owner fallback number">
            <TextInput value={draft.owner_fallback_number} onChange={(v) => setDraft({ ...draft, owner_fallback_number: v })} />
          </Field>
          <Field label="Support number">
            <TextInput value={draft.support_number} onChange={(v) => setDraft({ ...draft, support_number: v })} />
          </Field>
          <Field label="Public caller ID">
            <TextInput value={draft.public_caller_id} onChange={(v) => setDraft({ ...draft, public_caller_id: v })} />
          </Field>
          <Field label="Owner alert number">
            <TextInput value={draft.notify_number} onChange={(v) => setDraft({ ...draft, notify_number: v })} />
          </Field>
          <Field label="Maximum voicemail length (seconds)">
            <TextInput
              value={draft.voicemail_max_seconds}
              onChange={(v) => setDraft({ ...draft, voicemail_max_seconds: Number(v) || 0 })}
            />
          </Field>
          <Field label="Support ring timeout (seconds)">
            <TextInput value={draft.support_timeout} onChange={(v) => setDraft({ ...draft, support_timeout: Number(v) || 0 })} />
          </Field>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Toggle
            checked={draft.notify_owner_on_ticket !== false}
            onChange={(v) => setDraft({ ...draft, notify_owner_on_ticket: v })}
            label="Alert the owner when a technical support ticket is raised"
          />
          <Toggle
            checked={draft.voicemail_enabled !== false}
            onChange={(v) => setDraft({ ...draft, voicemail_enabled: v })}
            label="Voicemail offered when nobody answers"
          />
        </div>
        <Button
          className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
          onClick={async () => {
            await act({ action: "saveSettings", settings: draft });
            await refresh();
          }}
        >
          <Save className="mr-1 h-4 w-4" /> Save global settings
        </Button>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Flow engine endpoint</p>
        <p className="rounded-lg bg-[#FFFBF5] px-2 py-1 text-xs text-[#1A1A1A]/70">{data.engine_url}</p>
        <p className="mt-2 text-xs text-[#1A1A1A]/50">
          This is the webhook a number is pointed at when it goes live on the flow engine. Requests are signature-checked
          against the Twilio credentials held on the server.
        </p>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Configuration audit log</p>
        {!audit.length ? (
          <p className="text-sm text-[#1A1A1A]/45">No configuration change has been recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {audit.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#B8956A]/20 px-2 py-1.5 text-sm">
                <Pill tone="neutral">{entry.action}</Pill>
                <span className="text-[#1A1A1A]/75">{entry.summary}</span>
                <span className="ml-auto text-xs text-[#1A1A1A]/45">
                  {entry.actor_email} · {entry.at ? new Date(entry.at).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}