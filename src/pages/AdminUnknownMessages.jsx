import React, { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import UnknownTextThreadList from "@/components/admin/UnknownTextThreadList";
import UnknownTextThread from "@/components/admin/UnknownTextThread";

// Texts from numbers nobody recognises: they arrive on the shared company line, so no
// sales rep owns the thread and it lands nowhere. The webhook also texts the admin phone
// each time one arrives. Every read is re-authorised on the server.

function identity() {
  const read = (key) => localStorage.getItem(key) || sessionStorage.getItem(key) || "";
  return { sales_member_id: read("sales_member_id"), email: read("sales_member_email") || read("user_email") };
}

export default function AdminUnknownMessages() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState("");

  const call = useCallback(async (payload) => {
    const res = await base44.functions.invoke("adminUnknownMessages", { ...identity(), ...payload });
    const data = res?.data || res;
    if (data?.ok === false && data?.error === "FORBIDDEN") {
      throw new Error("Administrator access required.");
    }
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await call({ action: "list" });
      const list = data?.conversations || [];
      setConversations(list);
      setSelectedId((prev) => {
        if (prev && list.some((item) => item.id === prev)) return prev;
        return list[0]?.id || null;
      });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return;
    }
    let cancelled = false;
    setThreadLoading(true);
    call({ action: "thread", conversation_id: selectedId })
      .then((data) => {
        if (!cancelled) setThread(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, call]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif text-[#1A1A1A]">Unknown Texts</h1>
          <p className="mt-1 text-sm text-[#1A1A1A]/60">
            Messages that arrived from numbers we don't recognise. Each new one also sends an alert text to the admin phone.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="border-[#B8956A]/40 text-[#1A1A1A] hover:bg-[#B8956A]/10 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-2xl border border-[#B8956A]/25 bg-white overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] md:h-[600px]">
          <div className="border-b md:border-b-0 md:border-r border-[#B8956A]/20 overflow-y-auto">
            <UnknownTextThreadList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              loading={loading}
            />
          </div>
          <div className="min-h-[320px] md:min-h-0 overflow-hidden">
            <UnknownTextThread thread={thread} loading={threadLoading} />
          </div>
        </div>
      </div>
    </div>
  );
}