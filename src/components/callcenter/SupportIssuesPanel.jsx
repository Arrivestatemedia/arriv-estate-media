import { useEffect, useState } from "react";
import { callCenter } from "./callCenterClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2 } from "lucide-react";

function tone(status) {
  if (status === "ticket_created") return "bg-[#B8956A]/15 text-[#8a6b41]";
  if (status === "ticket_pending") return "bg-amber-50 text-amber-700";
  if (status === "resolved") return "bg-blue-50 text-blue-700";
  return "bg-red-50 text-red-700";
}

export default function SupportIssuesPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    callCenter({ action: "listIssues" })
      .then((d) => setItems(d?.issues || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const retry = async (issue) => {
    setBusy(issue.id);
    await callCenter({ action: "retryTicket", id: issue.id }).catch(() => null);
    setBusy("");
    load();
  };

  const resolve = async (issue) => {
    await callCenter({ action: "resolveIssue", id: issue.id }).catch(() => null);
    load();
  };

  if (loading) return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading support issues…</p>;
  if (!items.length)
    return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">No technical support issues yet.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#1A1A1A]/60">
        Arriv Assist owns ticket numbering. A ticket is only labelled created when Arriv Assist confirms it.
      </p>
      {items.map((issue) => (
        <Card key={issue.id} className="border-[#B8956A]/20 bg-white">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {issue.caller_name || issue.caller_number || "Unknown caller"}
                </p>
                <p className="text-xs text-[#1A1A1A]/50">
                  {issue.category?.replace("_", " ")} · {issue.receiving_number || "—"}
                  {issue.created_at ? ` · ${new Date(issue.created_at).toLocaleString()}` : ""}
                </p>
                {issue.assist_ticket_number ? (
                  <p className="mt-1 text-xs text-[#8a6b41]">Arriv Assist ticket {issue.assist_ticket_number}</p>
                ) : null}
                {issue.assist_error ? (
                  <p className="mt-1 text-xs text-red-600">{issue.assist_error}</p>
                ) : null}
              </div>
              <Badge className={tone(issue.status)}>{issue.status?.replace("_", " ")}</Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => retry(issue)} disabled={busy === issue.id}>
                <RefreshCw className={`mr-2 h-4 w-4 ${busy === issue.id ? "animate-spin" : ""}`} />
                {issue.assist_ticket_number ? "Re-check ticket" : "Retry Arriv Assist"}
              </Button>
              {issue.status !== "resolved" ? (
                <Button size="sm" onClick={() => resolve(issue)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Resolve
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}