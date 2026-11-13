import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, SectionHead, TextInput, Toggle } from "./IvrUi";
import { NodeConfigFields } from "./IvrNodeInspector";
import { nodeMeta } from "./ivrNodeTypes";

const ROUTING_TYPES = ["ring_group", "transfer_number", "transfer_extension"];

export default function IvrRouting({ data, act, refresh }) {
  const flows = data.flows || [];
  const settings = data.settings || {};
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const [nodes, setNodes] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState(settings);

  useEffect(() => {
    const flow = flows.find((f) => f.flow_key === flowKey);
    setNodes((flow?.nodes || []).filter((n) => ROUTING_TYPES.includes(n.type)));
  }, [flowKey, data.flows]);

  useEffect(() => setSettingsDraft(data.settings || {}), [data.settings]);

  if (!flows.length) return <Empty>Import your configuration first.</Empty>;

  const routingNodes = nodes;
  const patchNode = (updated) => setNodes((list) => list.map((n) => (n.id === updated.id ? updated : n)));

  const saveFlowNodes = async () => {
    const flow = flows.find((f) => f.flow_key === flowKey);
    const merged = (flow.nodes || []).map((n) => nodes.find((x) => x.id === n.id) || n);
    await act({
      action: "saveFlow",
      flow: { flow_key: flow.flow_key, name: flow.name, notes: flow.notes, start_node_id: flow.start_node_id, nodes: merged },
    });
    await refresh();
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Routing & Ring Groups"
        description="Who a call rings, in what order, for how long, and what happens when nobody answers. Every rule below belongs to a flow and is enabled, ordered and testable on its own."
      />

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Routing behavior</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Owner fallback number">
            <TextInput
              value={settingsDraft.owner_fallback_number}
              onChange={(v) => setSettingsDraft({ ...settingsDraft, owner_fallback_number: v })}
            />
          </Field>
          <Field label="Public caller ID">
            <TextInput
              value={settingsDraft.public_caller_id}
              onChange={(v) => setSettingsDraft({ ...settingsDraft, public_caller_id: v })}
            />
          </Field>
          <Field label="Ring stage 1 (seconds)">
            <TextInput
              value={settingsDraft.stage1_timeout}
              onChange={(v) => setSettingsDraft({ ...settingsDraft, stage1_timeout: Number(v) || 0 })}
            />
          </Field>
          <Field label="Ring stage 2 (seconds)">
            <TextInput
              value={settingsDraft.stage2_timeout}
              onChange={(v) => setSettingsDraft({ ...settingsDraft, stage2_timeout: Number(v) || 0 })}
            />
          </Field>
          <Field label="Ring stage 3 (seconds)">
            <TextInput
              value={settingsDraft.stage3_timeout}
              onChange={(v) => setSettingsDraft({ ...settingsDraft, stage3_timeout: Number(v) || 0 })}
            />
          </Field>
          <div className="flex items-end">
            <Button
              className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
              onClick={async () => {
                await act({ action: "saveSettings", settings: settingsDraft });
                await refresh();
              }}
            >
              <Save className="mr-1 h-4 w-4" /> Save routing
            </Button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <Toggle
            checked={settingsDraft.agent_acceptance_required}
            onChange={(v) => setSettingsDraft({ ...settingsDraft, agent_acceptance_required: v })}
            label="Require the answering person to press 1 before the caller is connected"
          />
          <Toggle
            checked={settingsDraft.voicemail_enabled !== false}
            onChange={(v) => setSettingsDraft({ ...settingsDraft, voicemail_enabled: v })}
            label="Voicemail available when nobody answers"
          />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <Field label="Flow">
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
          <Button size="sm" className="bg-[#1A1A1A] text-[#FFFBF5]" onClick={saveFlowNodes}>
            <Save className="mr-1 h-3.5 w-3.5" /> Save flow routing
          </Button>
        </div>

        {!routingNodes.length ? (
          <p className="text-sm text-[#1A1A1A]/45">This flow has no routing nodes yet — add a ring group or transfer in the builder.</p>
        ) : null}

        <div className="space-y-3">
          {routingNodes.map((node) => (
            <div key={node.id} className="rounded-xl border border-[#B8956A]/25 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-[#1A1A1A]/50">{nodeMeta(node.type).label}</p>
              <NodeConfigFields node={node} nodes={nodes} onChange={patchNode} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}