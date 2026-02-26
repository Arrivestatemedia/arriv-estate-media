import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, X, Search } from "lucide-react";
import { toast } from "sonner";

export default function TransferCallButton({ message, currentUserId }) {
  const [showTransfer, setShowTransfer] = useState(false);
  const [salesReps, setSalesReps] = useState([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showTransfer) {
      loadSalesReps();
    }
  }, [showTransfer]);

  const loadSalesReps = async () => {
    try {
      const reps = await base44.entities.SalesTeamMember.filter(
        { is_active: true },
        "full_name"
      );
      setSalesReps(reps.filter((r) => r.extension && r.twilio_phone_number));
    } catch (err) {
      console.error("Failed to load reps:", err);
      toast.error("Failed to load sales reps");
    }
  };

  const filteredReps = salesReps.filter(
    (rep) =>
      rep.full_name.toLowerCase().includes(searchInput.toLowerCase()) ||
      rep.extension?.toString().includes(searchInput)
  );

  const initiateTransfer = async () => {
    if (!selectedRep) {
      toast.error("Please select a recipient");
      return;
    }

    setLoading(true);
    try {
      const rep = salesReps.find((r) => r.id === selectedRep);
      toast.success(
        `Transfer initiated to ${rep.full_name} (${rep.extension})`
      );
      setShowTransfer(false);
      setSelectedRep("");
      setSearchInput("");
    } catch (err) {
      console.error("Transfer error:", err);
      toast.error("Failed to initiate transfer");
    }
    setLoading(false);
  };

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
        <button
          onClick={() => setShowTransfer(false)}
          className="text-gray-500 hover:text-gray-700"
        >
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

      <Select value={selectedRep} onValueChange={setSelectedRep}>
        <SelectTrigger className="text-sm">
          <SelectValue placeholder="Select recipient" />
        </SelectTrigger>
        <SelectContent>
          {filteredReps.length === 0 ? (
            <div className="p-2 text-xs text-gray-500 text-center">
              No reps available
            </div>
          ) : (
            filteredReps.map((rep) => (
              <SelectItem key={rep.id} value={rep.id}>
                {rep.full_name} ({rep.extension})
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      <Button
        onClick={initiateTransfer}
        disabled={!selectedRep || loading}
        className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white gap-2"
        size="sm"
      >
        <Phone className="w-3 h-3" />
        {loading ? "Transferring..." : "Confirm Transfer"}
      </Button>
    </div>
  );
}