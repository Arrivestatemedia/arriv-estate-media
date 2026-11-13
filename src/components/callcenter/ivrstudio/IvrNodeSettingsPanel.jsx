import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, SectionHead } from "./IvrUi";
import { NodeConfigFields } from "./IvrNodeInspector";
import { nodeMeta } from "./ivrNodeTypes";

/**
 * A section that edits one class of node across a flow. Used by Menus & Extensions
 * and Queues & Hold Music, so the same wording and behavior are edited the same way
 * whether an administrator reaches them from the section list or the builder.
 */
export default function IvrNodeSettingsPanel({ data, act, refresh, title, description, types }) {
  const flows = data.flows || [];
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const [nodes, setNodes] = useState([]);

  useEffect(() => {
    const flow = flows.find((f) => f.flow_key === flowKey);
    setNodes(((flow?.nodes || []).filter((n) => types.includes(n.type))));
  }, [flowKey, data.flows, types.join(",")]);

  if (!flows.length) return <Empty>Import your configuration first.</Empty>;

  const patchNode = (updated) => setNodes((list) => list.map((n) => (n.id === updated.id ? updated : n)));

  const save = async () => {
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
      <SectionHead title={title} description={description} />
      <div className="flex flex-wrap items-end justify-between gap-2">
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
        <Button size="sm" className="bg-[#1A1A1A] text-[#FFFBF5]" onClick={save}>
          <Save className="mr-1 h-3.5 w-3.5" /> Save as draft
        </Button>
      </div>

      {!nodes.length ? (
        <Empty>This flow has none of these nodes yet. Add one in the visual builder.</Empty>
      ) : null}

      {nodes.map((node) => (
        <Card key={node.id}>
          <p className="mb-2 text-xs uppercase tracking-wide text-[#1A1A1A]/50">
            {nodeMeta(node.type).label} · {node.label}
          </p>
          <NodeConfigFields node={node} nodes={nodes} onChange={patchNode} />
        </Card>
      ))}
    </div>
  );
}