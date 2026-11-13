import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, Rocket, Save, Trash2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Pill, SectionHead, TextInput, Field } from "./IvrUi";
import IvrNodeInspector from "./IvrNodeInspector";
import { NODE_CATALOG, blankNode, nodeMeta, targetsOfNode } from "./ivrNodeTypes";

const W = 200;
const H = 70;

export default function IvrFlowBuilder({ data, act, refresh }) {
  const flows = data.flows || [];
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const flow = flows.find((f) => f.flow_key === flowKey) || null;
  const [nodes, setNodes] = useState(flow?.nodes || []);
  const [startId, setStartId] = useState(flow?.start_node_id || "");
  const [selectedId, setSelectedId] = useState(null);
  const [issues, setIssues] = useState([]);
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [view, setView] = useState({ x: 20, y: 20, scale: 1 });
  const dragRef = useRef(null);
  const [addType, setAddType] = useState("ivr_menu");

  useEffect(() => {
    const current = (data.flows || []).find((f) => f.flow_key === flowKey) || (data.flows || [])[0];
    if (!current) {
      setNodes([]);
      setStartId("");
      return;
    }
    setFlowKey(current.flow_key);
    setNodes(current.nodes || []);
    setStartId(current.start_node_id || "");
    setSelectedId(null);
  }, [flowKey, data.flows]);

  if (!flows.length) {
    return <Empty>Import your configuration first, then a flow appears here to edit.</Empty>;
  }

  const selected = nodes.find((n) => n.id === selectedId) || null;
  const edges = [];
  nodes.forEach((node) => {
    targetsOfNode(node, nodes).forEach((to) => edges.push({ from: node.id, to }));
  });

  const patchNode = (updated) =>
    setNodes((list) => list.map((n) => (n.id === updated.id ? updated : n)));

  const save = async (extra = {}) => {
    await act({
      action: "saveFlow",
      flow: { flow_key: flowKey, name: flow?.name, notes: flow?.notes, start_node_id: startId, nodes },
      ...extra,
    });
    await refresh();
  };

  const publish = async () => {
    await save();
    const res = await act({ action: "publishFlow", flow_key: flowKey, note });
    if (res?.issues) setIssues(res.issues);
    setNote("");
    await refresh();
  };

  const startDrag = (e, node) => {
    e.stopPropagation();
    setSelectedId(node.id);
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, x: node.x || 0, y: node.y || 0 };
  };

  const startPan = (e) => {
    setSelectedId(null);
    dragRef.current = { pan: true, startX: e.clientX, startY: e.clientY, x: view.x, y: view.y };
  };

  const onMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.pan) {
      setView((v) => ({ ...v, x: drag.x + (e.clientX - drag.startX), y: drag.y + (e.clientY - drag.startY) }));
      return;
    }
    const dx = (e.clientX - drag.startX) / view.scale;
    const dy = (e.clientY - drag.startY) / view.scale;
    setNodes((list) => list.map((n) => (n.id === drag.id ? { ...n, x: Math.round(drag.x + dx), y: Math.round(drag.y + dy) } : n)));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Visual Flow Builder"
        description="Drag nodes to arrange the call, connect them through each node's paths, then save the draft. Publishing is the only step that changes what a caller hears."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={flow?.status === "published" ? "live" : "warn"}>
              {flow?.status === "published" ? `live · v${flow.version || 0}` : "draft"}
            </Pill>
            <Button size="sm" variant="outline" onClick={() => save()}>
              <Save className="mr-1 h-3.5 w-3.5" /> Save draft
            </Button>
            <Button size="sm" className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" onClick={publish}>
              <Rocket className="mr-1 h-3.5 w-3.5" /> Publish
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
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
        <Field label="Start node">
          <select
            value={startId}
            onChange={(e) => setStartId(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="">— none —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label || nodeMeta(n.type).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Add node">
          <div className="flex gap-1">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              {NODE_CATALOG.map((c) => (
                <option key={c.type} value={c.type}>
                  {c.label}
                </option>
              ))}
            </select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => {
                const node = blankNode(addType, nodes.length);
                setNodes((list) => [...list, node]);
                setSelectedId(node.id);
                if (!startId) setStartId(node.id);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        <Field label="Publish note">
          <TextInput value={note} onChange={setNote} placeholder="e.g. new HR wording" className="w-48" />
        </Field>
        {flows.length > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={async () => {
              await act({ action: "deleteFlow", flow_key: flowKey });
              await refresh();
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete flow
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <div
          className="relative h-[560px] touch-none overflow-hidden rounded-2xl border border-[#B8956A]/25 bg-[#FFFBF5]"
          onPointerDown={startPan}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm">
            <Button size="icon" variant="ghost" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale - 0.1) }))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-xs text-[#1A1A1A]/50">{Math.round(view.scale * 100)}%</span>
            <Button size="icon" variant="ghost" onClick={() => setView((v) => ({ ...v, scale: Math.min(1.6, v.scale + 0.1) }))}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setView({ x: 20, y: 20, scale: 1 })}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
              {edges.map((edge, i) => {
                const from = nodes.find((n) => n.id === edge.from);
                const to = nodes.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const x1 = (from.x || 0) + W / 2;
                const y1 = (from.y || 0) + H;
                const x2 = (to.x || 0) + W / 2;
                const y2 = to.y || 0;
                const mid = (y1 + y2) / 2;
                return (
                  <path
                    key={`${edge.from}-${edge.to}-${i}`}
                    d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#B8956A"
                    strokeWidth="1.6"
                    markerEnd="url(#arrow)"
                    opacity="0.75"
                  />
                );
              })}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="#B8956A" />
                </marker>
              </defs>
            </g>
          </svg>

          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            {nodes.map((node) => {
              const meta = nodeMeta(node.type);
              const isStart = node.id === startId;
              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => startDrag(e, node)}
                  className={`absolute cursor-grab select-none rounded-xl border-2 bg-white px-3 py-2 shadow-sm ${
                    selectedId === node.id ? "border-[#1A1A1A]" : "border-[#B8956A]/40"
                  }`}
                  style={{ left: node.x || 0, top: node.y || 0, width: W, minHeight: H }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.color}`}>
                      {meta.label}
                    </span>
                    {isStart ? <span className="text-[10px] font-semibold text-[#B8956A]">START</span> : null}
                  </div>
                  <p className="mt-1 truncate text-[13px] font-medium text-[#1A1A1A]">
                    {node.label || meta.label}
                  </p>
                  <p className="truncate text-[11px] text-[#1A1A1A]/45">
                    {node.config?.prompt || node.config?.text || node.config?.number || node.config?.url || ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="max-h-[560px] overflow-y-auto">
          <IvrNodeInspector
            node={selected}
            nodes={nodes}
            onChange={patchNode}
            onDelete={() => {
              setNodes((list) => list.filter((n) => n.id !== selectedId));
              setSelectedId(null);
            }}
          />
        </Card>
      </div>

      {issues.length ? (
        <Card className="border-amber-200 bg-amber-50">
          <p className="mb-1 flex items-center gap-1 text-sm font-medium text-amber-900">
            <ZoomIn className="h-4 w-4" /> Validation findings
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/80">
            {issues.map((issue, i) => (
              <li key={i}>
                <span className="font-medium uppercase">{issue.severity}</span> — {issue.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHead title="Create another flow" description="For example an after-hours flow or a dedicated line experience." />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Flow name">
            <TextInput value={newName} onChange={setNewName} placeholder="After hours — Atlanta" />
          </Field>
          <Button
            variant="outline"
            disabled={!newName.trim()}
            onClick={async () => {
              const key = `flow_${Date.now().toString(36)}`;
              await act({
                action: "saveFlow",
                flow: {
                  flow_key: key,
                  name: newName.trim(),
                  start_node_id: "n_start",
                  nodes: [
                    { id: "n_start", type: "incoming_call", label: "Incoming call", x: 80, y: 160, config: {}, next: { default: "" } },
                  ],
                },
              });
              setNewName("");
              await refresh();
              setFlowKey(key);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Create flow
          </Button>
        </div>
      </Card>
    </div>
  );
}