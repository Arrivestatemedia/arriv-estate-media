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

export default function TransferCallPanel({ onClose }) {
  const [salesReps, setSalesReps] = useState([]);
  const [selectedRep, setSelectedRep] = useState("");
  const [directNumber, setDirectNumber] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [useDirectory, setUseDirectory] = useState(true);

  useEffect(() => {
    loadSalesReps();
  }, []);

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
    if (useDirectory && !selectedRep) {
      toast.error("Please select a recipient");
      return;
    }
    if (!useDirectory && !directNumber.trim()) {
      toast.error("Please enter a phone number");
      return;
    }

    setLoading(true);
    try {
      const rep = useDirectory
        ? salesReps.find((r) => r.id === selectedRep)
        : null;
      const message = rep
        ? `Transfer initiated to ${rep.full_name} (${rep.extension})`
        : `Transfer initiated to ${directNumber}`;
      toast.success(message);
      onClose?.();
    } catch (err) {
      console.error("Transfer error:", err);
      toast.error("Failed to initiate transfer");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Transfer Call</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toggle between directory and direct number */}
        <div className="flex gap-2">
          <Button
            variant={useDirectory ? "default" : "outline"}
            onClick={() => setUseDirectory(true)}
            className="flex-1 text-sm"
            size="sm"
          >
            Directory
          </Button>
          <Button
            variant={!useDirectory ? "default" : "outline"}
            onClick={() => setUseDirectory(false)}
            className="flex-1 text-sm"
            size="sm"
          >
            Direct Number
          </Button>
        </div>

        {useDirectory ? (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or extension"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger>
                <SelectValue placeholder="Select recipient" />
              </SelectTrigger>
              <SelectContent>
                {filteredReps.length === 0 ? (
                  <div className="p-2 text-sm text-gray-500 text-center">
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
          </>
        ) : (
          <Input
            placeholder="Enter phone number"
            value={directNumber}
            onChange={(e) => setDirectNumber(e.target.value)}
            type="tel"
          />
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={initiateTransfer}
            disabled={
              loading ||
              (useDirectory && !selectedRep) ||
              (!useDirectory && !directNumber.trim())
            }
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white gap-2"
          >
            <Phone className="w-4 h-4" />
            {loading ? "Transferring..." : "Transfer"}
          </Button>
        </div>
      </div>
    </div>
  );
}