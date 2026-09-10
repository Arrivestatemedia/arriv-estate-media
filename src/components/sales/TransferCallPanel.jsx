import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, X, Search } from "lucide-react";
import { toast } from "sonner";

export default function TransferCallPanel({ onClose, currentCallNumber, currentCallName, onTransferAccepted }) {
  const [salesReps, setSalesReps] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitingFor, setWaitingFor] = useState(null); // { rep, recordId }
  const pollRef = useRef(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    base44.entities.SalesTeamMember.filter({ is_active: true }, "full_name")
      .then(reps => setSalesReps(reps.filter(r => r.extension)))
      .catch(() => toast.error("Failed to load sales reps"));
  }, []);

  const filteredReps = salesReps.filter(rep =>
    rep.full_name.toLowerCase().includes(searchInput.toLowerCase()) ||
    rep.extension?.toString().includes(searchInput)
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const initiateTransfer = async (rep) => {
    setLoading(true);
    try {
      const myId = localStorage.getItem('sales_member_id');
      const myName = localStorage.getItem('sales_member_name');

      const record = await base44.entities.PendingCallTransfer.create({
        from_member_id: myId,
        from_member_name: myName,
        to_member_id: rep.id,
        to_member_extension: rep.extension,
        caller_number: currentCallNumber || '',
        caller_name: currentCallName || currentCallNumber || 'Unknown Caller',
        status: 'pending'
      });

      const recordId = record?.id;
      if (!recordId) {
        toast.error("Failed to create transfer request");
        setLoading(false);
        return;
      }

      setWaitingFor({ rep, recordId });
      toast.success(`Waiting for ${rep.full_name} to accept...`);

      const handleAccepted = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
        setWaitingFor(null);
        onTransferAccepted?.(String(rep.extension));
        onClose?.();
      };

      const handleDeclined = () => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
        setWaitingFor(null);
        toast.error(`${rep.full_name} declined the transfer`);
      };

      // Poll every 2s — most reliable
      pollRef.current = setInterval(async () => {
        try {
          const results = await base44.entities.PendingCallTransfer.filter({ id: recordId });
          const updated = results?.[0];
          if (updated?.status === "accepted") handleAccepted();
          else if (updated?.status === "declined") handleDeclined();
        } catch (_) {}
      }, 2000);

      // Also subscribe for instant response
      try {
        unsubRef.current = base44.entities.PendingCallTransfer.subscribe((event) => {
          const matchId = event.id === recordId || event.data?.id === recordId;
          if (matchId && event.data?.status === "accepted") handleAccepted();
          if (matchId && event.data?.status === "declined") handleDeclined();
        });
      } catch (e) {
        console.error('[TransferCallPanel] subscribe failed:', e);
      }

      // Auto-expire after 60s
      setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
        setWaitingFor(null);
      }, 60000);

    } catch (err) {
      console.error("Transfer error:", err);
      toast.error("Failed to send transfer request");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Transfer Call</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by name or extension"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>

        {waitingFor ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto animate-pulse">
              <Phone className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-800">Waiting for <strong>{waitingFor.rep.full_name}</strong> to accept...</p>
            <Button variant="outline" size="sm" onClick={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
              setWaitingFor(null);
              base44.entities.PendingCallTransfer.update(waitingFor.recordId, { status: 'expired' }).catch(() => {});
            }}>Cancel Transfer</Button>
          </div>
        ) : (
          <>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {filteredReps.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No reps found</p>
              ) : (
                filteredReps.map(rep => (
                  <button
                    key={rep.id}
                    onClick={() => initiateTransfer(rep)}
                    disabled={loading}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#B8956A]/10 transition text-left"
                  >
                    <span className="text-sm font-medium text-gray-800">{rep.full_name}</span>
                    <span className="text-sm font-mono font-bold" style={{ color: '#B8956A' }}>Ext. {rep.extension}</span>
                  </button>
                ))
              )}
            </div>
            <Button variant="outline" onClick={onClose} className="w-full" disabled={loading}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}