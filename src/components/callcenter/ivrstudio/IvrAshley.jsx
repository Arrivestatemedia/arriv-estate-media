import React, { useEffect, useState } from "react";
import { Bot, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, SectionHead, TextArea, TextInput, Toggle } from "./IvrUi";

export default function IvrAshley({ data, act, refresh, go }) {
  const [draft, setDraft] = useState(data.settings || {});
  useEffect(() => setDraft(data.settings || {}), [data.settings]);

  const ashleyFlowNodes = (data.flows || []).flatMap((flow) =>
    (flow.nodes || []).filter((n) => n.type === "ashley_ai").map((n) => ({ flow: flow.name, node: n }))
  );

  return (
    <div className="space-y-3">
      <SectionHead
        title="Ashley — AI Concierge"
        description="When Ashley answers, what she may do, and what happens when she cannot help. Her conversation engine is unchanged; these controls decide where she is placed and what she is allowed to complete."
      />

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#B8956A]" />
          <p className="text-sm font-medium text-[#1A1A1A]">Availability and permissions</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <Toggle checked={draft.ashley_enabled !== false} onChange={(v) => setDraft({ ...draft, ashley_enabled: v })} label="Ashley may answer calls" />
          <Toggle
            checked={!!draft.ashley_booking_enabled}
            onChange={(v) => setDraft({ ...draft, ashley_booking_enabled: v })}
            label="Ashley may create bookings through the standard booking workflow"
          />
          <Toggle
            checked={draft.notify_owner_on_voicemail !== false}
            onChange={(v) => setDraft({ ...draft, notify_owner_on_voicemail: v })}
            label="Notify the owner when Ashley takes a message"
          />
          <Toggle
            checked={draft.notify_owner_on_callback !== false}
            onChange={(v) => setDraft({ ...draft, notify_owner_on_callback: v })}
            label="Notify the owner about Ashley callbacks"
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="Conversation turn limit">
            <TextInput value={draft.ashley_max_turns} onChange={(v) => setDraft({ ...draft, ashley_max_turns: Number(v) || 0 })} />
          </Field>
          <Field label="Callback assignment">
            <select
              value={draft.callback_assignment || "owner"}
              onChange={(e) => setDraft({ ...draft, callback_assignment: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="client_owner">The client's own advisor</option>
              <option value="round_robin">Round robin across advisors</option>
            </select>
          </Field>
          <Field label="Owner alert number">
            <TextInput value={draft.notify_number} onChange={(v) => setDraft({ ...draft, notify_number: v })} placeholder="+14047891107" />
          </Field>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">What callers hear</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Public caller greeting" hint="{first_name} and {rep_name} are filled in when known">
            <TextArea rows={2} value={draft.greeting_public} onChange={(v) => setDraft({ ...draft, greeting_public: v })} />
          </Field>
          <Field label="Recognised client greeting">
            <TextArea rows={2} value={draft.greeting_client} onChange={(v) => setDraft({ ...draft, greeting_client: v })} />
          </Field>
          <Field label="Media Specialist greeting">
            <TextArea rows={2} value={draft.greeting_specialist} onChange={(v) => setDraft({ ...draft, greeting_specialist: v })} />
          </Field>
          <Field label="Prospect greeting">
            <TextArea rows={2} value={draft.greeting_prospect} onChange={(v) => setDraft({ ...draft, greeting_prospect: v })} />
          </Field>
          <Field label="When the team cannot answer">
            <TextArea
              rows={2}
              value={draft.support_overflow_text}
              onChange={(v) => setDraft({ ...draft, support_overflow_text: v })}
            />
          </Field>
          <Field label="Technical support prompt">
            <TextArea rows={2} value={draft.tech_support_prompt} onChange={(v) => setDraft({ ...draft, tech_support_prompt: v })} />
          </Field>
        </div>
        <Button
          className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
          onClick={async () => {
            await act({ action: "saveSettings", settings: draft });
            await refresh();
          }}
        >
          <Save className="mr-1 h-4 w-4" /> Save Ashley settings
        </Button>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium text-[#1A1A1A]">Where Ashley sits in the call flows</p>
        <p className="mb-2 text-sm text-[#1A1A1A]/55">
          Ashley answers wherever an Ashley node receives the call. Nothing else routes to her.
        </p>
        {ashleyFlowNodes.length ? (
          <ul className="space-y-1 text-sm text-[#1A1A1A]/70">
            {ashleyFlowNodes.map((entry, i) => (
              <li key={i} className="rounded-lg border border-[#B8956A]/20 px-2 py-1">
                {entry.flow} · {entry.node.label} (department: {entry.node.config?.department || "general"})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#1A1A1A]/45">No flow currently routes to Ashley.</p>
        )}
        <Button size="sm" variant="outline" className="mt-3" onClick={() => go("builder")}>
          Place Ashley in a flow
        </Button>
      </Card>
    </div>
  );
}