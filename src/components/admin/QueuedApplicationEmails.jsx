import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Mail, Clock, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import moment from "moment";

const STATUS_META = {
  pending: { label: "Queued", color: "#f59e0b", icon: Clock },
  sent: { label: "Sent", color: "#10b981", icon: CheckCircle2 },
  failed: { label: "Failed", color: "#ef4444", icon: XCircle },
};

export default function QueuedApplicationEmails() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState("pending");

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["queued-application-emails", filter],
    queryFn: () =>
      base44.entities.QueuedApplicationEmail.filter(
        filter === "all" ? {} : { status: filter },
        "-scheduled_for",
        100
      ),
    refetchInterval: 30000,
  });

  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = base44.entities.QueuedApplicationEmail.subscribe(() =>
        queryClient.invalidateQueries({ queryKey: ["queued-application-emails"] })
      );
    } catch (e) {
      console.error('[QueuedApplicationEmails] subscribe failed:', e);
    }
    return unsub;
  }, [queryClient]);

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["queued-application-emails"] });

  const removeQueued = async (id) => {
    if (!window.confirm("Remove this queued email? It will not be sent.")) return;
    await base44.entities.QueuedApplicationEmail.delete(id);
    queryClient.invalidateQueries({ queryKey: ["queued-application-emails"] });
  };

  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white mb-6">
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {expanded ? (
              <ChevronDown className="w-5 h-5 text-[#1A1A1A]/50" />
            ) : (
              <ChevronRight className="w-5 h-5 text-[#1A1A1A]/50" />
            )}
            <Mail className="w-5 h-5 text-[#B8956A]" />
            <div>
              <CardTitle className="text-[#1A1A1A]">
                Queued Application Emails
              </CardTitle>
              <p className="text-xs text-[#1A1A1A]/60">
                Emails waiting in the 9pm–8am ET quiet-hours queue ·{" "}
                <span className="text-[#B8956A] font-medium">
                  {pendingCount} pending
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              refresh();
            }}
            className="text-[#1A1A1A]/60 hover:text-[#1A1A1A]"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {[
              { value: "pending", label: "Queued" },
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
              { value: "all", label: "All" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === f.value
                    ? "bg-[#1A1A1A] text-[#FFFBF5] border-[#1A1A1A]"
                    : "bg-white text-[#1A1A1A]/70 border-[#B8956A]/20 hover:border-[#B8956A]/50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="text-sm text-[#1A1A1A]/60 py-4 text-center">
              Loading queued emails...
            </p>
          ) : queue.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/60 py-4 text-center">
              No {filter === "all" ? "" : filter} emails in the queue.
            </p>
          ) : (
            <ul className="space-y-2">
              {queue.map((q) => {
                const meta = STATUS_META[q.status] || STATUS_META.pending;
                const StatusIcon = meta.icon;
                return (
                  <li
                    key={q.id}
                    className="flex items-start gap-3 bg-[#FFFBF5] border border-[#B8956A]/15 rounded-lg p-3"
                  >
                    <StatusIcon
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: meta.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A] truncate">
                        {q.subject}
                      </p>
                      <p className="text-xs text-[#1A1A1A]/60 truncate">
                        To: {q.recipient_email}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#1A1A1A]/50">
                        <span>
                          {q.status === "pending"
                            ? `Sends ${moment(q.scheduled_for).format("MMM D, h:mm A")}`
                            : `Scheduled ${moment(q.scheduled_for).format("MMM D, h:mm A")}`}
                        </span>
                        {q.status === "sent" && q.sent_at && (
                          <span className="text-[#10b981]">
                            · Sent {moment(q.sent_at).format("MMM D, h:mm A")}
                          </span>
                        )}
                        {q.status === "failed" && (
                          <span className="text-[#ef4444]">
                            · Attempt {q.attempts}/{q.max_attempts}
                            {q.last_error ? ` · ${q.last_error}` : ""}
                          </span>
                        )}
                        {q.status === "pending" && (
                          <span>· Attempt {q.attempts}/{q.max_attempts}</span>
                        )}
                      </div>
                    </div>
                    {q.status === "pending" && (
                      <button
                        onClick={() => removeQueued(q.id)}
                        className="text-[#1A1A1A]/40 hover:text-[#ef4444] p-1"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}