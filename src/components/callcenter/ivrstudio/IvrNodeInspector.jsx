import React from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput, TextArea } from "./IvrUi";
import { MENU_OPTION_DIGITS, NODE_FIELDS, nodeMeta } from "./ivrNodeTypes";

const NEXT_LABELS = {
  default: "Next step",
  success: "On success",
  failure: "On failure",
  no_input: "No input",
  invalid: "Invalid input",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Failed",
};

function TargetSelect({ value, onChange, nodes, selfId, placeholder }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
    >
      <option value="">{placeholder || "— none —"}</option>
      {nodes
        .filter((n) => n.id !== selfId)
        .map((n) => (
          <option key={n.id} value={n.id}>
            {n.label || nodeMeta(n.type).label}
          </option>
        ))}
    </select>
  );
}

/** Config fields for one node — shared by the builder inspector and the section panels. */
export function NodeConfigFields({ node, nodes, onChange }) {
  const fields = NODE_FIELDS[node.type] || [];
  const cfg = node.config || {};

  const setConfig = (key, value) => onChange({ ...node, config: { ...cfg, [key]: value } });
  const isMenu = node.type === "ivr_menu" || node.type === "gather_keypad";
  const options = Array.isArray(cfg.options) ? cfg.options : [];

  const setOption = (index, patch) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    setConfig("options", next);
  };

  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const value = cfg[field.key];
        if (field.kind === "checkbox") {
          return (
            <label key={field.key} className="flex items-center gap-2 text-sm text-[#1A1A1A]/75">
              <input type="checkbox" checked={!!value} onChange={(e) => setConfig(field.key, e.target.checked)} />
              {field.label}
            </label>
          );
        }
        if (field.kind === "target") {
          return (
            <Field key={field.key} label={field.label}>
              <TargetSelect value={value} onChange={(v) => setConfig(field.key, v)} nodes={nodes} selfId={node.id} />
            </Field>
          );
        }
        if (field.kind === "textarea") {
          return (
            <Field key={field.key} label={field.label}>
              <TextArea value={value} onChange={(v) => setConfig(field.key, v)} placeholder={field.placeholder} />
            </Field>
          );
        }
        return (
          <Field key={field.key} label={field.label}>
            <TextInput
              value={value}
              onChange={(v) => setConfig(field.key, field.kind === "number" ? Number(v) || 0 : v)}
              placeholder={field.placeholder}
            />
          </Field>
        );
      })}

      {node.type === "ring_group" ? (
        <div className="rounded-lg border border-[#B8956A]/25 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Ring group members</p>
          <div className="space-y-2">
            {(Array.isArray(cfg.members) ? cfg.members : []).map((member, index) => (
              <div key={index} className="flex items-center gap-2">
                <TextInput
                  value={member.name}
                  onChange={(v) =>
                    setConfig(
                      "members",
                      (cfg.members || []).map((m, i) => (i === index ? { ...m, name: v } : m))
                    )
                  }
                  placeholder="Name"
                />
                <TextInput
                  value={member.number}
                  onChange={(v) =>
                    setConfig(
                      "members",
                      (cfg.members || []).map((m, i) => (i === index ? { ...m, number: v } : m))
                    )
                  }
                  placeholder="+1..."
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setConfig("members", (cfg.members || []).filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setConfig("members", [...(cfg.members || []), { name: "", number: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add member
          </Button>
        </div>
      ) : null}

      {isMenu ? (
        <div className="rounded-lg border border-[#B8956A]/25 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">
            Keypad options and where each one goes
          </p>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="grid grid-cols-[64px_1fr_1fr_36px] items-center gap-2">
                <select
                  value={option.key}
                  onChange={(e) => setOption(index, { key: e.target.value })}
                  className="h-9 rounded-md border border-input bg-white px-1 text-sm"
                >
                  {MENU_OPTION_DIGITS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <TextInput
                  value={option.label}
                  onChange={(v) => setOption(index, { label: v })}
                  placeholder="What it is for"
                />
                <TargetSelect
                  value={option.target}
                  onChange={(v) => setOption(index, { target: v })}
                  nodes={nodes}
                  selfId={node.id}
                  placeholder="Destination"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setConfig("options", options.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() =>
              setConfig("options", [...options, { key: String(options.length + 1), label: "", target: "" }])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add option
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border border-[#B8956A]/25 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">Paths</p>
        <div className="space-y-2">
          {Object.entries(node.next || {}).map(([label, target]) => (
            <div key={label} className="grid grid-cols-[120px_1fr_36px] items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[#1A1A1A]/50">{NEXT_LABELS[label] || label}</span>
              <TargetSelect
                value={target}
                onChange={(v) => onChange({ ...node, next: { ...(node.next || {}), [label]: v } })}
                nodes={nodes}
                selfId={node.id}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  const next = { ...(node.next || {}) };
                  delete next[label];
                  onChange({ ...node, next });
                }}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-white px-2 text-xs"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                onChange({ ...node, next: { ...(node.next || {}), [e.target.value]: "" } });
              }}
            >
              <option value="">Add a path…</option>
              {Object.entries(NEXT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IvrNodeInspector({ node, nodes, onChange, onDelete }) {
  if (!node) {
    return (
      <div className="rounded-2xl border border-dashed border-[#B8956A]/30 p-6 text-sm text-[#1A1A1A]/45">
        Select a node on the canvas to edit its properties.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[#1A1A1A]/50">
          {nodeMeta(node.type).label}
        </span>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
      <Field label="Node name">
        <TextInput value={node.label} onChange={(v) => onChange({ ...node, label: v })} />
      </Field>
      <NodeConfigFields node={node} nodes={nodes} onChange={onChange} />
    </div>
  );
}