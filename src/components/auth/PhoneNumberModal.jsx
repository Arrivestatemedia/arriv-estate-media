import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PhoneNumberModal({ open, onClose, onSubmit, loading }) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError("Phone number is required");
      return;
    }
    onSubmit(phoneNumber);
  };

  const handleOpenChange = (isOpen) => {
    if (!isOpen && !loading) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Phone Number Required</DialogTitle>
          <DialogDescription>
            We need your phone number to complete your account setup.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
              Phone Number
            </label>
            <Input
              type="tel"
              inputMode="tel"
              required
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setError("");
              }}
              placeholder="+1 (555) 123-4567"
              className="border-[#B8956A]/30 focus:border-[#B8956A]"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
          >
            {loading ? "Continuing..." : "Continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}