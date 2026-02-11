import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function CancelJobDialog({ job, open, onOpenChange, onSubmit, isLoading }) {
  const [reason, setReason] = useState("");

  if (!job || !open) return null;

  const handleSubmit = () => {
    onSubmit(job.id, reason);
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-2 border-[#B8956A]/30">
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A]">Cancel This Booking?</DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60">
            Please let us know why you're cancelling so we can improve.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-[#1A1A1A] mb-2">{job.title}</p>
            <p className="text-xs text-[#1A1A1A]/60">{job.location}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-[#1A1A1A] block mb-2">
              Reason for cancellation
            </label>
            <Textarea
              placeholder="Tell us why you're cancelling..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-[#B8956A]/30 focus:border-[#B8956A]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[#1A1A1A]/20"
          >
            Keep Booking
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? "Cancelling..." : "Cancel Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}