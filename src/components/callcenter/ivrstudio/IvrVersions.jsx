import React, { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, Pill, SectionHead, TextInput } from "./IvrUi";

export default function IvrVersions({ data, act }) {
  const flows = data.flows || [];
  const [flowKey, setFlowKey] = useState(flows[0]?.flow_key || "");
  const [versions, setVersions] = useState([]);
  const [note, setNote] = useState("");

  const load = async (key = flowKey) => {
    if (!key) return;
    const res = await act({ action: "listVersions", flow_key: key });
    setVersions(res?.versions || []);
  };

  useEffect(() => {
    load(flowKey);
  }, [flowKey, data.flows]);

  if (!flows.length) return <Empty>Import your configuration first.</Empty>;
  const flow = flows.find((f) => f.flow_key === flowKey);

  return (
    <div className="space-y-3">
      <SectionHead
        title="Versions & Publishing"
        description="Publishing snapshots the exact flow, so any earlier version can be put back in seconds. A restore is itself a new version — nothing is lost."
        right={
          <Button
            size="sm"
            className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
            onClick={async () => {
              await act({ action: "publishFlow", flow_key: flowKey, note });
              setNote("");
              await load();
            }}
          >
            Publish current draft
          </Button>
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
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Live version">
            <div className="flex h-9 items-center">
              <Pill tone={flow?.status === "published" ? "live" : "warn"}>
                {flow?.status === "published" ? `version ${flow.version}` : "draft only — not live"}
              </Pill>
            </div>
          </Field>
          <Field label="Publish note">
            <TextInput value={note} onChange={setNote} placeholder="What changed" />
          </Field>
        </div>
      </Card>

      <Card>
        <p className="mb-2 flex items-center gap-1 text-sm font-medium text-[#1A1A1A]">
          <History className="h-4 w-4" /> Published versions
        </p>
        {!versions.length ? (
          <p className="text-sm text-[#1A1A1A]/45">Nothing has been published for this flow yet.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B8956A]/20 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    Version {version.version}
                    {version.restored_from ? ` · restored from v${version.restored_from}` : ""}
                    {Number(version.version) === Number(flow?.version) ? " · live" : ""}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/50">
                    {version.published_by || "administrator"} ·{" "}
                    {version.published_at ? new Date(version.published_at).toLocaleString() : ""}
                    {version.note ? ` · ${version.note}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await act({ action: "rollbackFlow", flow_key: flowKey, version: version.version });
                    await load();
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}