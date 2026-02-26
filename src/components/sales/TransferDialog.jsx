import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneForwarded, Loader2 } from "lucide-react";

export default function TransferDialog({ open, onOpenChange, onTransfer }) {
  const [transferMethod, setTransferMethod] = useState("rep"); // 'rep' or 'extension'
  const [selectedRepId, setSelectedRepId] = useState("");
  const [selectedExtension, setSelectedExtension] = useState("");
  const [salesReps, setSalesReps] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadSalesReps();
    }
  }, [open]);

  const loadSalesReps = async () => {
    try {
      const reps = await base44.entities.SalesTeamMember.filter({ is_active: true });
      setSalesReps(reps);
    } catch (err) {
      console.error('Failed to load sales reps:', err);
    }
  };

  const handleTransfer = async () => {
    setLoading(true);
    try {
      if (transferMethod === "rep" && !selectedRepId) {
        alert("Please select a sales representative");
        return;
      }
      if (transferMethod === "extension" && !selectedExtension) {
        alert("Please enter an extension");
        return;
      }

      const payload = transferMethod === "rep" 
        ? { recipientSalesRepId: selectedRepId }
        : { recipientExtension: selectedExtension };

      const res = await base44.functions.invoke('transferCall', payload);
      
      if (res.data.success) {
        onTransfer(res.data.targetPhoneNumber);
        onOpenChange(false);
        setSelectedRepId("");
        setSelectedExtension("");
      }
    } catch (err) {
      console.error('Transfer failed:', err);
      alert('Transfer failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentRep = salesReps.find(r => r.id === selectedRepId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneForwarded className="w-5 h-5" style={{ color: '#B8956A' }} />
            Transfer Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Transfer Method</label>
            <Select value={transferMethod} onValueChange={setTransferMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rep">Select Sales Rep</SelectItem>
                <SelectItem value="extension">Enter Extension</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {transferMethod === "rep" ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Sales Representative</label>
                <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps.map(rep => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.full_name} {rep.extension ? `(${rep.extension})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {currentRep && (
                <div className="p-3 bg-blue-50 rounded-lg text-sm">
                  <p><strong>Name:</strong> {currentRep.full_name}</p>
                  {currentRep.extension && <p><strong>Extension:</strong> {currentRep.extension}</p>}
                  {currentRep.title && <p><strong>Title:</strong> {currentRep.title}</p>}
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Extension Number</label>
              <Input
                placeholder="e.g., 101, 201"
                value={selectedExtension}
                onChange={(e) => setSelectedExtension(e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={loading}
              className="flex-1 gap-2"
              style={{ backgroundColor: '#B8956A' }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  <PhoneForwarded className="w-4 h-4" />
                  Transfer
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}