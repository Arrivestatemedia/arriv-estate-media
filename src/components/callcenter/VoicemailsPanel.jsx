import { useEffect, useState } from "react";
import { callCenter } from "./callCenterClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, CheckCircle2 } from "lucide-react";

export default function VoicemailsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [audio, setAudio] = useState({});
  const [notes, setNotes] = useState({});

  const load = () => {
    setLoading(true);
    callCenter({ action: "listVoicemails" })
      .then((d) => setItems(d?.voicemails || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const play = async (vm) => {
    const res = await callCenter({ action: "voicemailUrl", id: vm.id }).catch(() => null);
    if (res?.signed_url) setAudio((a) => ({ ...a, [vm.id]: res.signed_url }));
  };

  const update = async (vm, patch) => {
    await callCenter({ action: "updateVoicemail", id: vm.id, patch }).catch(() => null);
    load();
  };

  if (loading) return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading voicemails…</p>;
  if (!items.length) return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">No voicemails yet.</p>;

  return (
    <div className="space-y-3">
      {items.map((vm) => (
        <Card key={vm.id} className="border-[#B8956A]/20 bg-white">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {vm.caller_name || vm.caller_number || "Unknown caller"}
                </p>
                <p className="text-xs text-[#1A1A1A]/50">
                  {vm.caller_number} · {vm.category?.replace("_", " ")} · {vm.recording_duration || 0}s
                  {vm.created_at ? ` · ${new Date(vm.created_at).toLocaleString()}` : ""}
                </p>
              </div>
              <Badge
                className={
                  vm.status === "unreviewed"
                    ? "bg-amber-50 text-amber-700"
                    : vm.status === "resolved"
                    ? "bg-[#B8956A]/15 text-[#8a6b41]"
                    : "bg-blue-50 text-blue-700"
                }
              >
                {vm.status}
              </Badge>
            </div>

            {audio[vm.id] ? (
              <audio controls src={audio[vm.id]} className="w-full" />
            ) : (
              <Button variant="outline" size="sm" onClick={() => play(vm)} disabled={!vm.recording_file_uri}>
                <Play className="mr-2 h-4 w-4" />
                {vm.recording_file_uri ? "Play recording" : "Recording unavailable"}
              </Button>
            )}

            <Textarea
              placeholder="Internal notes"
              value={notes[vm.id] ?? vm.notes ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [vm.id]: e.target.value }))}
              className="min-h-[64px]"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => update(vm, { status: "reviewed", notes: notes[vm.id] ?? vm.notes ?? "" })}
              >
                Mark reviewed
              </Button>
              <Button
                size="sm"
                onClick={() => update(vm, { status: "resolved", notes: notes[vm.id] ?? vm.notes ?? "" })}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Resolved
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}