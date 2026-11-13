import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, SectionHead, TextArea, TextInput, Toggle } from "./IvrUi";
import { NodeConfigFields } from "./IvrNodeInspector";

export default function IvrVoicemail({ data, act, refresh }) {
  const numbers = data.numbers || [];
  const flows = data.flows || [];
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const [nodes, setNodes] = useState([]);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    const flow = flows.find((f) => f.flow_key === flowKey);
    setNodes((flow?.nodes || []).filter((n) => n.type === "voicemail"));
  }, [flowKey, data.flows]);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        (data.numbers || []).map((n) => [
          n.phone_number,
          { ...n, voicemail: { enabled: true, max_seconds: 180, transcribe: false, notify_owner: true, ...(n.voicemail || {}) } },
        ])
      )
    );
  }, [data.numbers]);

  if (!numbers.length) return <Empty>Import your configuration first.</Empty>;

  return (
    <div className="space-y-3">
      <SectionHead
        title="Voicemail Management"
        description="Prompt, length, transcription and who is notified — per number, plus every voicemail node in a flow."
      />

      {numbers.map((number) => {
        const draft = drafts[number.phone_number] || number;
        const vm = draft.voicemail || {};
        return (
          <Card key={number.phone_number}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#1A1A1A]">
                {number.label || number.phone_number} · {number.phone_number}
              </p>
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
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Maximum message (seconds)">
                <TextInput
                  value={vm.max_seconds}
                  onChange={(v) =>
                    setDrafts({ ...drafts, [number.phone_number]: { ...draft, voicemail: { ...vm, max_seconds: Number(v) || 0 } } })
                  }
                />
              </Field>
              <Field label="Prompt before the beep" className="md:col-span-2">
                <TextArea
                  rows={2}
                  value={vm.prompt}
                  onChange={(v) =>
                    setDrafts({ ...drafts, [number.phone_number]: { ...draft, voicemail: { ...vm, prompt: v } } })
                  }
                  placeholder="Please leave your name, number and a short message after the tone."
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Toggle
                checked={vm.enabled !== false}
                onChange={(v) => setDrafts({ ...drafts, [number.phone_number]: { ...draft, voicemail: { ...vm, enabled: v } } })}
                label="Voicemail enabled"
              />
              <Toggle
                checked={!!vm.transcribe}
                onChange={(v) => setDrafts({ ...drafts, [number.phone_number]: { ...draft, voicemail: { ...vm, transcribe: v } } })}
                label="Transcribe messages"
              />
              <Toggle
                checked={vm.notify_owner !== false}
                onChange={(v) => setDrafts({ ...drafts, [number.phone_number]: { ...draft, voicemail: { ...vm, notify_owner: v } } })}
                label="Notify the owner"
              />
            </div>
          </Card>
        );
      })}

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <Field label="Voicemail nodes in flow">
            <select
              value={flowKey}
              onChange={(e) => setFlowKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              {flows.map((f) => (
                <option key={f.flow_key} value={f.flow_key}>
                  {f.name} ({f.status})
                </option>
              ))}
            </select>
          </Field>
          <Button
            size="sm"
            className="bg-[#1A1A1A] text-[#FFFBF5]"
            onClick={async () => {
              const flow = flows.find((f) => f.flow_key === flowKey);
              const merged = (flow.nodes || []).map((n) => nodes.find((x) => x.id === n.id) || n);
              await act({
                action: "saveFlow",
                flow: { flow_key: flow.flow_key, name: flow.name, notes: flow.notes, start_node_id: flow.start_node_id, nodes: merged },
              });
              await refresh();
            }}
          >
            <Save className="mr-1 h-3.5 w-3.5" /> Save flow
          </Button>
        </div>
        {!nodes.length ? <p className="text-sm text-[#1A1A1A]/45">No voicemail nodes in this flow.</p> : null}
        <div className="space-y-3">
          {nodes.map((node) => (
            <div key={node.id} className="rounded-xl border border-[#B8956A]/25 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-[#1A1A1A]/50">{node.label}</p>
              <NodeConfigFields
                node={node}
                nodes={nodes}
                onChange={(updated) => setNodes((list) => list.map((n) => (n.id === updated.id ? updated : n)))}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}