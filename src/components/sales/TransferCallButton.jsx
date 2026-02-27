import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, X, Search } from "lucide-react";
import { toast } from "sonner";

// Transfer to a specific member (DM) or pick from list (channel)
export default function TransferCallButton({ message, currentUserId, chatType, dmRecipientId, dmRecipientName }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  const myId = localStorage.getItem('sales_member_id');

  useEffect(() => {
    // Only need to load members for channel (list selection)
    if (showTransfer && chatType === "channel") {
      loadMembers();
    }
  }, [showTransfer, chatType]);

  const loadMembers = async () => {
    try {
      const members = await base44.entities.SalesTeamMember.filter({ is_active: true }, "full_name");
      // Exclude self
      setAllMembers(members.filter((m) => m.id !== myId && m.extension));
    } catch (err) {
      console.error("Failed to load members:", err);
      toast.error("Failed to load team members");
    }
  };

  const filteredMembers = allMembers.filter(
    (m) =>
      m.full_name.toLowerCase().includes(searchInput.toLowerCase()) ||
      m.extension?.toString().includes(searchInput)
  );

  const doTransfer = async (rep) => {
    setLoading(true);
    try {
      const myName = localStorage.getItem('sales_member_name');
      await base44.entities.PendingCallTransfer.create({
        from_member_id: myId,
        from_member_name: myName,
        to_member_id: rep.id,
        to_member_extension: rep.extension,
        caller_number: '',
        caller_name: 'Chat transfer',
        status: 'pending'
      });
      toast.success(`Transfer request sent to ${rep.full_name}`);
      setShowTransfer(false);
    } catch (err) {
      console.error("Transfer error:", err);
      toast.error("Failed to send transfer request");
    }
    setLoading(false);
  };

  // For DM: just one button to transfer to the person you're chatting with
  if (chatType === "dm") {
    // Don't show if somehow chatting with yourself
    if (dmRecipientId === myId) return null;

    return (
      <Button
        size="sm"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            // Look up the DM recipient's member record to get their extension
            const members = await base44.entities.SalesTeamMember.filter({ id: dmRecipientId });
            const rep = members?.[0];
            if (!rep?.extension) {
              toast.error(`${dmRecipientName} doesn't have an extension set up`);
              setLoading(false);
              return;
            }
            await doTransfer(rep);
          } catch (err) {
            toast.error("Failed to send transfer request");
          }
          setLoading(false);
        }}
        className="mt-2 bg-[#B8956A] hover:bg-[#A68559] text-white gap-2"
      >
        <Phone className="w-3 h-3" />
        {loading ? "Sending..." : `Transfer to ${dmRecipientName}`}
      </Button>
    );
  }

  // For channel: show list excluding self
  if (!showTransfer) {
    return (
      <Button
        size="sm"
        onClick={() => setShowTransfer(true)}
        className="mt-2 bg-[#B8956A] hover:bg-[#A68559] text-white gap-2"
      >
        <Phone className="w-3 h-3" />
        Transfer Call
      </Button>
    );
  }

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">Transfer to:</p>
        <button onClick={() => setShowTransfer(false)} className="text-gray-500 hover:text-gray-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search by name or extension"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      <div className="space-y-1 max-h-48 overflow-y-auto">
        {filteredMembers.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-2">No team members available</p>
        ) : (
          filteredMembers.map((rep) => (
            <button
              key={rep.id}
              onClick={() => doTransfer(rep)}
              disabled={loading}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#B8956A]/10 text-sm flex items-center justify-between"
            >
              <span className="font-medium">{rep.full_name}</span>
              <span className="text-gray-400 text-xs">ext. {rep.extension}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}