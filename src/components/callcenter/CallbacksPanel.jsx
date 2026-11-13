import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const callCenter = (payload) =>
  base44.functions.invoke("callCenterAdmin", payload).then((r) => r?.data ?? r);

export default function CallbacksPanel() {
  const [items, setItems] = useState([]);
  const [reps, setReps] = useState([]);
  const [status, setStatus] = useState("pending");
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    callCenter({ action: "listCallbacks", status: status === "all" ? undefined : status })
      .then((d) => setItems(d?.callbacks || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);
  useEffect(() => {
    callCenter({ action: "getSettings" })
      .then((d) => setReps(d?.reps || []))
      .catch(() => setReps([]));
  }, []);

  const update = async (cb, patch) => {
    await callCenter({ action: "updateCallback", id: cb.id, patch }).catch(() => null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#1A1A1A]/60">Callback requests captured by the IVR and Ashley.</p>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading callbacks…</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#1A1A1A]/50">No callbacks in this view.</p>
      ) : (
        items.map((cb) => (
          <Card key={cb.id} className="border-[#B8956A]/20 bg-white">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {cb.caller_name || cb.caller_number} · {cb.caller_number}
                  </p>
                  <p className="text-xs text-[#1A1A1A]/50">
                    {cb.category?.replace("_", " ")} · {cb.caller_type || "unknown"}
                    {cb.created_at ? ` · ${new Date(cb.created_at).toLocaleString()}` : ""}
                  </p>
                  {cb.reason ? <p className="mt-1 text-xs text-[#1A1A1A]/60">“{cb.reason}”</p> : null}
                </div>
                <div className="flex gap-2">
                  <Badge className="bg-amber-50 text-amber-700">{cb.priority || "normal"}</Badge>
                  <Badge className="bg-blue-50 text-blue-700">{cb.status}</Badge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={cb.assigned_to_email || "owner"}
                  onValueChange={(email) => {
                    const rep = reps.find((r) => r.id === email) || reps.find((r) => r.name === email);
                    update(cb, {
                      assigned_to_email: rep?.name && !rep?.id ? email : rep?.name || "Owner",
                      assigned_to_member_id: rep?.id || "",
                      assigned_to_name: rep?.name || "Owner",
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={cb.priority || "normal"} onValueChange={(priority) => update(cb, { priority })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Textarea
                placeholder="Notes"
                value={notes[cb.id] ?? cb.notes ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [cb.id]: e.target.value }))}
                className="min-h-[60px]"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => update(cb, { status: "in_progress", notes: notes[cb.id] ?? cb.notes ?? "" })}
                >
                  Mark in progress
                </Button>
                <Button
                  size="sm"
                  onClick={() => update(cb, { status: "completed", notes: notes[cb.id] ?? cb.notes ?? "" })}
                >
                  Mark completed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => update(cb, { status: "cancelled" })}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}