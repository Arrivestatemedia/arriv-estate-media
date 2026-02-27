import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Shows an Accept/Decline banner inside the chat when a call transfer is incoming.
 * On Accept, emits a custom window event so the dialer can ring the call through.
 */
export default function IncomingTransferBanner({ salesMemberId }) {
  const [pendingTransfer, setPendingTransfer] = useState(null);

  useEffect(() => {
    if (!salesMemberId) return;

    // Also check for any existing pending transfers on mount
    base44.entities.PendingCallTransfer.filter({ to_member_id: salesMemberId, status: "pending" })
      .then(records => { if (records?.[0]) setPendingTransfer(records[0]); })
      .catch(() => {});

    const unsubscribe = base44.entities.PendingCallTransfer.subscribe((event) => {
      if (event.type === "create" && event.data?.to_member_id === salesMemberId && event.data?.status === "pending") {
        setPendingTransfer(event.data);
      }
      if (event.type === "update" && event.data?.to_member_id === salesMemberId && event.data?.status !== "pending") {
        setPendingTransfer(prev => prev?.id === event.data?.id ? null : prev);
      }
    });

    return unsubscribe;
  }, [salesMemberId]);

  const accept = async () => {
    if (!pendingTransfer) return;
    try {
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "accepted" });
      // The transferring rep's dialer will now disconnect and dial this rep's extension.
      // That will cause a normal incoming Twilio call to ring on this dialer automatically.
      toast.success("Transfer accepted — the call will ring on your dialer shortly");
    } catch (e) {
      console.error("Failed to accept transfer:", e);
      toast.error("Failed to accept transfer");
    }
    setPendingTransfer(null);
  };

  const decline = async () => {
    if (!pendingTransfer) return;
    try {
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "declined" });
    } catch (e) {
      console.error("Failed to decline transfer:", e);
    }
    setPendingTransfer(null);
  };

  if (!pendingTransfer) return null;

  return (
    <div className="mx-4 mb-2 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-4 shadow-sm">
      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
        <Phone className="w-5 h-5 text-blue-600 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">Call Transfer from {pendingTransfer.from_member_name}</p>
        <p className="text-xs text-gray-500 truncate">{pendingTransfer.caller_name || pendingTransfer.caller_number || "Unknown Caller"}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button size="sm" onClick={decline} variant="destructive" className="h-8 px-3">
          <PhoneOff className="w-3 h-3 mr-1" /> Decline
        </Button>
        <Button size="sm" onClick={accept} className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white">
          <Phone className="w-3 h-3 mr-1" /> Accept
        </Button>
      </div>
    </div>
  );
}