import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function CancelBookingDialog({ booking, open, onOpenChange, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const close = (isOpen) => {
    if (!isOpen) {
      setReason("");
      setError(null);
      setDone(false);
    }
    onOpenChange(isOpen);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.fetch("/requestBookingChange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          changeRequest: { is_cancellation: true, notes: reason },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        throw new Error(data?.error || "We couldn't send your cancellation request.");
      }
      setDone(true);
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setError(err.message || "We couldn't send your cancellation request.");
    } finally {
      setBusy(false);
    }
  };

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-primary)]">
            {done ? "Cancellation requested" : "Cancel this booking?"}
          </DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {done
              ? "We've received your request and our team will confirm by email shortly."
              : `${booking.property_address || "Your shoot"} on ${booking.preferred_date || "your scheduled date"}${booking.preferred_time ? ` at ${booking.preferred_time}` : ""}.`}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--accent-color)]/5 p-3">
              <CheckCircle2 className="w-5 h-5 mt-0.5 text-[var(--accent-color)] flex-shrink-0" />
              <p className="text-sm text-[var(--text-secondary)]">
                Nothing has been cancelled yet — our team reviews every cancellation and will reply to your email address.
              </p>
            </div>
            <Button className="w-full bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white" onClick={() => close(false)}>
              Back to my bookings
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Why are you cancelling? (optional)</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Let us know so we can help."
                rows={3}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => close(false)} disabled={busy}>
                Keep my booking
              </Button>
              <Button variant="destructive" onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Request cancellation
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}