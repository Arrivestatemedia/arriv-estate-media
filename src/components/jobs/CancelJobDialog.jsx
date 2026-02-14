import React, { useState, useMemo } from "react";
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
import { Phone } from "lucide-react";

export default function CancelJobDialog({ job, open, onOpenChange, onSubmit, isLoading, success, onClose }) {
  const [reason, setReason] = useState("");

  // Check if cancellation is within 1 hour of appointment
  const isWithinOneHour = useMemo(() => {
    if (!job?.date || !job?.start_time) return false;
    
    try {
      const [time, period] = job.start_time.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      
      if (period === 'PM' && hours !== 12) hour24 += 12;
      if (period === 'AM' && hours === 12) hour24 = 0;
      
      const jobDateTime = new Date(job.date + 'T00:00:00');
      jobDateTime.setHours(hour24, minutes, 0, 0);
      
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      return jobDateTime <= oneHourFromNow;
    } catch (error) {
      return false;
    }
  }, [job?.date, job?.start_time]);

  const handleSubmit = () => {
    if (job) {
      onSubmit(job.id, reason);
      setReason("");
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose(job);
    }
    onOpenChange(false);
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && success) {
        handleClose();
      } else {
        onOpenChange(isOpen);
      }
    }}>
      <DialogContent className="border-2 border-[#B8956A]/30">
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Job Cancelled</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                You are no longer assigned to this job.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-[#1A1A1A]">
                You have successfully cancelled your booking for <span className="font-semibold">{job.title}</span>.
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={handleClose}
                className="bg-[#B8956A] hover:bg-[#A68559] text-white"
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : isWithinOneHour ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#1A1A1A]">Call to Cancel</DialogTitle>
              <DialogDescription className="text-[#1A1A1A]/60">
                This booking is within 1 hour of the appointment time.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4 text-center">
              <div className="flex justify-center">
                <div className="bg-[#B8956A]/10 p-4 rounded-full">
                  <Phone className="w-8 h-8 text-[#B8956A]" />
                </div>
              </div>
              <div>
                <p className="text-sm text-[#1A1A1A] mb-3">
                  To cancel this booking, please call:
                </p>
                <a 
                  href="tel:6782429107"
                  className="text-2xl font-bold text-[#B8956A] hover:text-[#A68559] transition-colors"
                >
                  (678) 242-9107
                </a>
              </div>
              <p className="text-xs text-[#1A1A1A]/60">
                Due to the short notice, we need to handle this cancellation directly.
              </p>
            </div>
            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className="bg-[#B8956A] hover:bg-[#A68559] text-white w-full"
              >
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}