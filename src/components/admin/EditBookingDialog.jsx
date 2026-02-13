import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { isWeekend, format, parse } from "date-fns";
import { Clock } from "lucide-react";

const timeSlots = {
  weekday: ["3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM"],
  weekend: ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM"],
};

// Helper to parse YYYY-MM-DD string to local Date object
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  return parse(dateString, 'yyyy-MM-dd', new Date());
};

// Helper to format Date object to YYYY-MM-DD string
const formatLocalDate = (date) => {
  return format(date, 'yyyy-MM-dd');
};

export default function EditBookingDialog({ booking, open, onOpenChange, onSave }) {
  const [formData, setFormData] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (booking) {
      setFormData({
        client_name: booking.client_name || "",
        client_email: booking.client_email || "",
        client_phone: booking.client_phone || "",
        street_address: booking.street_address || "",
        city: booking.city || "",
        state: booking.state || "",
        preferred_date: booking.preferred_date || "",
        preferred_time: booking.preferred_time || "",
        notes: booking.notes || "",
        total_price: booking.total_price || 0,
      });
    }
  }, [booking]);

  const handleDateSelect = (date) => {
    if (!date) return;
    const dateString = formatLocalDate(date);
    setFormData({ ...formData, preferred_date: dateString });
  };

  const handleSave = async () => {
    if (!formData.client_name || !formData.preferred_date || !formData.preferred_time) {
      alert("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const availableTimeSlots = formData?.preferred_date
    ? (() => {
      const [year, month, day] = formData.preferred_date.split('-').map(Number);
      return isWeekend(new Date(year, month - 1, day))
        ? timeSlots.weekend
        : timeSlots.weekday;
    })()
    : [];

  if (!formData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Booking - {booking?.client_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <Input
                value={formData.client_name}
                onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <Input
                type="email"
                value={formData.client_email}
                onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <Input
                value={formData.client_phone}
                onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Total Price</label>
              <Input
                type="number"
                value={formData.total_price}
                onChange={(e) => setFormData({ ...formData, total_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Street Address *</label>
            <Input
              value={formData.street_address}
              onChange={(e) => setFormData({ ...formData, street_address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">City *</label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State *</label>
              <Input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                maxLength="2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Preferred Date *</label>
            <Calendar
              mode="single"
              selected={parseLocalDate(formData.preferred_date)}
              onSelect={handleDateSelect}
              disabled={(date) => date < new Date()}
              className="border-2 border-[var(--border-color)] rounded-lg p-3"
            />
          </div>

          {formData.preferred_date && (
            <div>
              <label className="block text-sm font-medium mb-2">
                <Clock className="w-4 h-4 inline mr-2" />
                Preferred Time *
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {availableTimeSlots.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setFormData({ ...formData, preferred_time: time })}
                    className={`p-2 text-sm rounded-lg border-2 transition-all ${
                      formData.preferred_time === time
                        ? "bg-[var(--accent-color)] text-white border-[var(--accent-color)]"
                        : "border-[var(--border-color)] hover:border-[var(--accent-color)]"
                    }`}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="h-20"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-[var(--border-color)]">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}