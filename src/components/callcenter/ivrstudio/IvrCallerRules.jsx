import React, { useState } from "react";
import { FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, Pill, SectionHead, TextArea, TextInput, Toggle } from "./IvrUi";

const FIELDS = [
  { key: "caller_number", label: "Incoming caller number" },
  { key: "dialed_number", label: "Dialed business number" },
  { key: "caller_type", label: "Caller identity (client, prospect, …)" },
  { key: "caller_role", label: "Caller role" },
  { key: "employee_status", label: "Employee status" },
  { key: "applicant_status", label: "Applicant status" },
  { key: "application_stage", label: "Application stage" },
  { key: "client_status", label: "Client status" },
  { key: "prospect_assigned", label: "Prospect assignment" },
  { key: "assigned_rep", label: "Assigned representative" },
  { key: "business_hours", label: "Business hours (open/closed)" },
  { key: "holiday", label: "Holiday (yes/no)" },
  { key: "weekday", label: "Weekday (0 = Sunday)" },
  { key: "minutes_of_day", label: "Minutes since midnight" },
  { key: "previous_selection", label: "Previous IVR selection" },
  { key: "previous_failed_transfer", label: "Previous failed transfer" },
];

const OPERATORS = [
  { key: "equals", label: "is exactly" },
  { key: "not_equals", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "starts_with", label: "starts with" },
  { key: "in", label: "is one of (comma separated)" },
  { key: "greater_than", label: "is greater than" },
  { key: "less_than", label: "is less than" },
  { key: "exists", label: "is present" },
];

const ACTIONS = [
  { type: "play_greeting", label: "Play a greeting", fields: ["text", "voice_profile_key"] },
  { type: "play_private_announcement", label: "Play a private announcement on transfer", fields: ["text"] },
  { type: "route_menu", label: "Route to a node in this flow", fields: ["target"] },
  { type: "transfer", label: "Transfer the call", fields: ["number"] },
  { type: "voicemail", label: "Send to voicemail", fields: ["text"] },
  { type: "route_ashley", label: "Hand the call to Ashley", fields: [] },
  { type: "end_call", label: "End the call", fields: ["text"] },
];

const BLANK_RULE = {
  name: "",
  priority: 100,
  enabled: true,
  match: "all",
  bypass_ivr: false,
  conditions: [{ field: "caller_number", operator: "equals", value: "" }],
  actions: [{ type: "play_greeting", text: "" }],
  notes: "",
};

export default function IvrCallerRules({ data, act, refresh }) {
  const rules = [...(data.rules || [])].sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));
  const voices = data.voices || [];
  const nodes = (data.flows || []).flatMap((flow) =>
    (flow.nodes || []).map((node) => ({ flow: flow.name, id: node.id, label: node.label || node.type }))
  );
  const [editing, setEditing] = useState(null);
  const [testInput, setTestInput] = useState({ caller_number: "", dialed_number: "", caller_type: "public", applicant_status: "" });
  const [testResult, setTestResult] = useState(null);

  const startNew = () => setEditing({ ...BLANK_RULE, rule_key: "" });

  const save = async () => {
    await act({ action: "saveRule", rule: editing });
    setEditing(null);
    await refresh();
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Caller Recognition & Rules"
        description="Rules decide what happens before the standard menu: which greeting a known caller hears, whether the menu is skipped, and who receives the transfer. Lower priority numbers are checked first."
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={startNew}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New rule
            </Button>
          </div>
        }
      />

      <Card>
        <p className="mb-2 flex items-center gap-1 text-sm font-medium text-[#1A1A1A]">
          <FlaskConical className="h-4 w-4" /> Preview how a specific caller is handled
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Caller number">
            <TextInput value={testInput.caller_number} onChange={(v) => setTestInput({ ...testInput, caller_number: v })} placeholder="+14047891107" />
          </Field>
          <Field label="Dialed number">
            <TextInput value={testInput.dialed_number} onChange={(v) => setTestInput({ ...testInput, dialed_number: v })} placeholder="+18557654306" />
          </Field>
          <Field label="Recognised as">
            <select
              value={testInput.caller_type}
              onChange={(e) => setTestInput({ ...testInput, caller_type: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {["public", "client", "b2b_client", "media_specialist", "prospect", "owner_admin", "unknown"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button
              className="bg-[#1A1A1A] text-[#FFFBF5] hover:bg-[#2A3536]"
              onClick={async () => {
                const res = await act({ action: "testRule", ...testInput });
                if (!res?.error) setTestResult(res);
              }}
            >
              Run test
            </Button>
          </div>
        </div>
        {testResult ? (
          <div className="mt-2 rounded-xl bg-[#FFFBF5] px-3 py-2 text-sm text-[#1A1A1A]/75">
            {testResult.matched ? (
              <>
                <span className="font-medium">{testResult.matched.name}</span> would handle this call (priority{" "}
                {testResult.matched.priority}) with{" "}
                {(testResult.matched.actions || []).map((a) => a.type).join(", ") || "no actions"}.
              </>
            ) : (
              "No recognition rule matches this caller — the standard flow handles the call."
            )}
          </div>
        ) : null}
      </Card>

      {editing ? (
        <Card className="border-[#B8956A]/50">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Rule name">
              <TextInput value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
            </Field>
            <Field label="Priority" hint="Lower runs first">
              <TextInput value={editing.priority} onChange={(v) => setEditing({ ...editing, priority: Number(v) || 100 })} />
            </Field>
            <Field label="Match">
              <select
                value={editing.match}
                onChange={(e) => setEditing({ ...editing, match: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="all">Every condition</option>
                <option value="any">Any condition</option>
              </select>
            </Field>
            <div className="space-y-2">
              <Toggle checked={editing.enabled} onChange={(v) => setEditing({ ...editing, enabled: v })} label="Enabled" />
            </div>
          </div>

          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Conditions</p>
          <div className="mt-1 space-y-2">
            {editing.conditions.map((condition, index) => (
              <div key={index} className="grid grid-cols-[1fr_150px_1fr_36px] items-center gap-2">
                <select
                  value={condition.field}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      conditions: editing.conditions.map((c, i) => (i === index ? { ...c, field: e.target.value } : c)),
                    })
                  }
                  className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                >
                  {FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  value={condition.operator}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      conditions: editing.conditions.map((c, i) => (i === index ? { ...c, operator: e.target.value } : c)),
                    })
                  }
                  className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                >
                  {OPERATORS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <TextInput
                  value={condition.value}
                  onChange={(v) =>
                    setEditing({
                      ...editing,
                      conditions: editing.conditions.map((c, i) => (i === index ? { ...c, value: v } : c)),
                    })
                  }
                  placeholder="Value"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setEditing({ ...editing, conditions: editing.conditions.filter((_, i) => i !== index) })
                  }
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEditing({ ...editing, conditions: [...editing.conditions, { field: "caller_type", operator: "equals", value: "" }] })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
            </Button>
          </div>

          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Actions, in order</p>
          <div className="mt-1 space-y-2">
            {editing.actions.map((action, index) => {
              const meta = ACTIONS.find((a) => a.type === action.type) || ACTIONS[0];
              return (
                <div key={index} className="grid grid-cols-[190px_1fr_36px] items-start gap-2">
                  <select
                    value={action.type}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        actions: editing.actions.map((a, i) =>
                          i === index ? { ...a, type: e.target.value, target: "", text: "", number: "" } : a
                        ),
                      })
                    }
                    className="h-9 rounded-md border border-input bg-white px-2 text-sm"
                  >
                    {ACTIONS.map((a) => (
                      <option key={a.type} value={a.type}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-1">
                    {meta.fields.includes("text") ? (
                      <TextArea
                        rows={2}
                        value={action.text}
                        onChange={(v) =>
                          setEditing({
                            ...editing,
                            actions: editing.actions.map((a, i) => (i === index ? { ...a, text: v } : a)),
                          })
                        }
                        placeholder="What is said"
                      />
                    ) : null}
                    {meta.fields.includes("number") ? (
                      <TextInput
                        value={action.number}
                        onChange={(v) =>
                          setEditing({
                            ...editing,
                            actions: editing.actions.map((a, i) => (i === index ? { ...a, number: v } : a)),
                          })
                        }
                        placeholder="+14047891107"
                      />
                    ) : null}
                    {meta.fields.includes("target") ? (
                      <select
                        value={action.target}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            actions: editing.actions.map((a, i) => (i === index ? { ...a, target: e.target.value } : a)),
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                      >
                        <option value="">Choose a node</option>
                        {nodes.map((n) => (
                          <option key={`${n.flow}-${n.id}`} value={n.id}>
                            {n.flow} · {n.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {meta.fields.includes("voice_profile_key") ? (
                      <select
                        value={action.voice_profile_key || ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            actions: editing.actions.map((a, i) =>
                              i === index ? { ...a, voice_profile_key: e.target.value } : a
                            ),
                          })
                        }
                        className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                      >
                        <option value="">Number / studio voice</option>
                        {voices.map((v) => (
                          <option key={v.voice_key} value={v.voice_key}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing({ ...editing, actions: editing.actions.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              );
            })}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing({ ...editing, actions: [...editing.actions, { type: "play_greeting", text: "" }] })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add action
            </Button>
          </div>

          <Field label="Notes" className="mt-3">
            <TextArea rows={2} value={editing.notes} onChange={(v) => setEditing({ ...editing, notes: v })} />
          </Field>

          <div className="mt-3 flex items-center gap-2">
            <Button className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" onClick={save}>
              <Save className="mr-1 h-4 w-4" /> Save rule
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {!rules.length ? <Empty>No recognition rules yet.</Empty> : null}

      {rules.map((rule) => (
        <Card key={rule.rule_key} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="neutral">priority {rule.priority}</Pill>
                <p className="text-sm font-medium text-[#1A1A1A]">{rule.name}</p>
                {rule.enabled === false ? <Pill tone="danger">disabled</Pill> : <Pill tone="live">active</Pill>}
                {rule.match_count ? <Pill tone="gold">{rule.match_count} matches</Pill> : null}
              </div>
              <p className="mt-1 text-xs text-[#1A1A1A]/55">
                {(rule.conditions || [])
                  .map((c) => `${FIELDS.find((f) => f.key === c.field)?.label || c.field} ${OPERATORS.find((o) => o.key === c.operator)?.label || c.operator} ${c.value}`)
                  .join(rule.match === "any" ? " OR " : " AND ") || "No conditions"}
              </p>
              <p className="text-xs text-[#1A1A1A]/45">
                Actions: {(rule.actions || []).map((a) => ACTIONS.find((x) => x.type === a.type)?.label || a.type).join(" → ") || "none"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Toggle
                checked={rule.enabled !== false}
                onChange={async (v) => {
                  await act({ action: "saveRule", rule: { ...rule, enabled: v } });
                  await refresh();
                }}
                label=""
              />
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...rule })}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={async () => {
                  await act({ action: "deleteRule", rule_key: rule.rule_key });
                  await refresh();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}