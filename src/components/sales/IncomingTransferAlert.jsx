import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Listens for pending call transfers directed to the current member.
 * When one arrives, shows a modal asking them to accept or decline.
 * On accept, dials the caller's number via the dialer (starts the call).
 */
export default function IncomingTransferAlert({ salesMemberId, onAccept }) {
  const [pendingTransfer, setPendingTransfer] = useState(null);

  useEffect(() => {
    if (!salesMemberId) return;

    // Subscribe to new PendingCallTransfer records
    const unsubscribe = base44.entities.PendingCallTransfer.subscribe(async (event) => {
      if (event.type === "create" && event.data?.to_member_id === salesMemberId && event.data?.status === "pending") {
        setPendingTransfer(event.data);
      }
      // Clear if it gets cancelled/expired
      if ((event.type === "update" || event.type === "delete") && event.data?.to_member_id === salesMemberId) {
        if (event.data?.status !== "pending") {
          setPendingTransfer(prev => prev?.id === event.data?.id ? null : prev);
        }
      }
    });

    return unsubscribe;
  }, [salesMemberId]);

  const accept = async () => {
    if (!pendingTransfer) return;
    try {
      // Mark accepted — the transferring rep's dialer is watching this and will
      // disconnect their current call and dial this recipient's extension via Twilio.
      // That will cause a normal incoming call to ring on THIS dialer automatically.
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "accepted" });
    } catch (e) {
      console.error("Failed to accept transfer:", e);
    }
    setPendingTransfer(null);
    // The incoming Twilio call will ring through on its own — no need to initiate anything here
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <Phone className="w-7 h-7 text-blue-600 animate-pulse" />
        </div>
        <p className="text-sm text-gray-500 mb-1">Call Transfer from</p>
        <p className="text-lg font-bold text-gray-900 mb-1">{pendingTransfer.from_member_name}</p>
        <p className="text-base font-semibold mb-1" style={{ color: '#B8956A' }}>
          {pendingTransfer.caller_name || pendingTransfer.caller_number}
        </p>
        <p className="text-xs text-gray-400 mb-6">Wants to transfer this call to you</p>
        <div className="flex gap-3">
          <Button onClick={decline} variant="destructive" className="flex-1 h-12">
            <PhoneOff className="w-4 h-4 mr-2" /> Decline
          </Button>
          <Button onClick={accept} className="flex-1 h-12 bg-green-600 hover:bg-green-700">
            <Phone className="w-4 h-4 mr-2" /> Accept
          </Button>
        </div>
      </div>
    </div>
  );
}