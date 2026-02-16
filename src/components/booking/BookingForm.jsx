import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock } from "lucide-react";
import { format, isWeekend, setHours, setMinutes, parse } from "date-fns";
import { cn } from "@/lib/utils";

const inputStyles = "";

const timeSlots = {
  weekday: ["3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM"],
  weekend: [
    "9:00 AM",
    "9:30 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
    "12:00 PM",
    "12:30 PM",
    "1:00 PM",
    "1:30 PM",
    "2:00 PM",
    "2:30 PM",
    "3:00 PM",
    "3:30 PM",
    "4:00 PM",
    "4:30 PM",
    "5:00 PM",
  ],
};

export default function BookingForm({ selectedPackage, cartAddOns, addOns, requestPayAtClosing, onSubmit, onCancel, isEditing, editingBooking }) {
  const totalPrice = (selectedPackage?.price || 0) + (cartAddOns || []).reduce((sum, a) => sum + a.price, 0);
  
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    street_address: editingBooking?.street_address || "",
    city: editingBooking?.city || "",
    state: editingBooking?.state || "",
    preferred_date: editingBooking?.preferred_date || null,
    preferred_time: editingBooking?.preferred_time || "",
    notes: editingBooking?.notes || "",
    is_cancellation: false,
    package: selectedPackage?.id || (editingBooking?.package || ""),
    add_ons: (cartAddOns || []).map(a => a.id),
    total_price: totalPrice,
  });

  useEffect(() => {
    // Pre-fill client info from localStorage or user data
    const loadClientInfo = async () => {
      if (editingBooking) {
        setFormData(prev => ({
          ...prev,
          client_name: editingBooking.client_name || "",
          client_email: editingBooking.client_email || "",
          client_phone: editingBooking.client_phone || "",
        }));
      } else {
        try {
          const user = await base44.auth.me();
          if (user) {
            setFormData(prev => ({
              ...prev,
              client_name: user.full_name || "",
              client_email: user.email || "",
              client_phone: user.phone_number || "",
            }));
          }
        } catch (error) {
          // User not logged in, check localStorage
          const userName = localStorage.getItem('user_name');
          const userEmail = localStorage.getItem('user_email');
          const userPhone = localStorage.getItem('user_phone');
          
          setFormData(prev => ({
            ...prev,
            client_name: userName || "",
            client_email: userEmail || "",
            client_phone: userPhone || "",
          }));
        }
      }
    };
    loadClientInfo();
  }, [editingBooking]);

  const [busySlots, setBusySlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const autocompleteService = useRef(null);
  const placesService = useRef(null);

  useEffect(() => {
    // Initialize Google Places Autocomplete
    if (window.google && !autocompleteService.current) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
      placesService.current = new window.google.maps.places.PlacesService(document.createElement('div'));
    }
  }, []);

  useEffect(() => {
    if (formData.preferred_date) {
      setLoadingSlots(true);
      base44.functions.invoke('getAvailableTimeSlots', { date: formData.preferred_date })
        .then(response => {
          setBusySlots(response.data.busySlots || []);
          setLoadingSlots(false);
        })
        .catch(() => {
          setBusySlots([]);
          setLoadingSlots(false);
        });
    }
  }, [formData.preferred_date]);

  const handleStreetChange = async (e) => {
    const value = e.target.value;
    setFormData({ ...formData, street_address: value });

    if (value.length > 2 && autocompleteService.current) {
      try {
        const response = await autocompleteService.current.getPlacePredictions({
          input: value,
          componentRestrictions: { country: 'us' },
        });
        setPredictions(response.predictions || []);
        setShowPredictions(true);
      } catch (error) {
        setPredictions([]);
      }
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  const handleAddressSelect = (prediction) => {
    setFormData({ ...formData, street_address: prediction.description });
    setPredictions([]);
    setShowPredictions(false);
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    // Use local date values to avoid timezone conversion issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    setFormData({ ...formData, preferred_date: dateString, preferred_time: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      console.error('Booking submission error:', error);
    }
  };

  const isTimeSlotBusy = (timeSlot) => {
    if (!formData.preferred_date) return false;
    
    const [time, period] = timeSlot.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    const [year, month, day] = formData.preferred_date.split('-').map(Number);
    const slotDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    
    return busySlots.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return slotDateTime >= busyStart && slotDateTime < busyEnd;
    });
  };

  const availableTimeSlots = formData.preferred_date
    ? (() => {
      const [year, month, day] = formData.preferred_date.split('-').map(Number);
      return isWeekend(new Date(year, month - 1, day))
        ? timeSlots.weekend.filter(slot => !isTimeSlotBusy(slot))
        : timeSlots.weekday.filter(slot => !isTimeSlotBusy(slot));
    })()
    : [];

  const isDateDisabled = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Button
          onClick={onCancel}
          variant="ghost"
          className="mb-6 text-[#1A1A1A]/60 hover:text-[#1A1A1A]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isEditing ? "Back to My Bookings" : "Back to Packages"}
        </Button>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-2 border-[#B8956A]/20">
            <CardHeader>
              <CardTitle className="text-2xl text-[#1A1A1A]">
                {isEditing ? "Request Changes to Your Booking" : "Complete Your Booking"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-[#B8956A]/10 rounded-lg p-4 border border-[#B8956A]/30">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-[#1A1A1A]/60">
                      {selectedPackage ? "Selected Package" : "Cart Total"}
                    </p>
                    {selectedPackage && (
                      <p className="text-lg font-semibold text-[#1A1A1A]">{selectedPackage.name}</p>
                    )}
                  </div>
                  {requestPayAtClosing ? (
                    <p className="text-xl font-bold text-[#B8956A] italic">Pricing will be discussed</p>
                  ) : (
                    <p className="text-2xl font-bold text-[#B8956A]">${formData.total_price}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Full Name *
                  </label>
                  <Input
                    type="text"
                    required
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Email Address *
                  </label>
                  <Input
                    type="email"
                    required
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                    className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                  Phone Number
                </label>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={formData.client_phone}
                  onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                  className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                />
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                    Listing Street Address & House Number *
                  </label>
                  <Input
                    required
                    value={formData.street_address}
                    onChange={handleStreetChange}
                    onFocus={() => predictions.length > 0 && setShowPredictions(true)}
                    className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                    placeholder="123 Main St"
                    autoComplete="off"
                  />
                  {showPredictions && predictions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#B8956A]/30 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                      {predictions.map((prediction) => (
                        <button
                          key={prediction.place_id}
                          type="button"
                          onClick={() => handleAddressSelect(prediction)}
                          className="w-full text-left px-4 py-2 hover:bg-[#B8956A]/10 border-b border-[#B8956A]/10 last:border-b-0 text-sm text-[#1A1A1A]"
                        >
                          <div className="font-medium text-[#1A1A1A]">{prediction.main_text}</div>
                          <div className="text-xs text-[#1A1A1A]/60">{prediction.secondary_text}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                      City *
                    </label>
                    <Input
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                      placeholder="New York"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                      State *
                    </label>
                    <Input
                      required
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                      maxLength="2"
                      className={cn("border-[#B8956A]/30 focus:border-[#B8956A]", inputStyles)}
                      placeholder="NY"
                    />
                  </div>
                </div>
              </div>

              {cartAddOns && cartAddOns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#1A1A1A]">Selected Add-Ons:</p>
                  {cartAddOns.map((addon) => (
                    <div key={addon.id} className="flex justify-between text-sm text-[#1A1A1A]/70">
                      <span>• {addon.name}</span>
                      {requestPayAtClosing ? (
                        <span className="font-semibold italic">Pricing will be discussed</span>
                      ) : (
                        <span className="font-semibold">${addon.price}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                  Preferred Date *
                </label>
                <Calendar
                  mode="single"
                  selected={formData.preferred_date ? (() => {
                    const [year, month, day] = formData.preferred_date.split('-').map(Number);
                    return new Date(year, month - 1, day);
                  })() : undefined}
                  onSelect={handleDateSelect}
                  disabled={isDateDisabled}
                  className="border-2 border-[#B8956A]/20 rounded-lg p-3"
                />
              </div>

              {formData.preferred_date && (
                <div>
                  <label className="block text-sm font-medium text-[#1A1A1A] mb-3">
                    <Clock className="w-4 h-4 inline mr-2" />
                    Available Time Slots *
                  </label>
                  {loadingSlots ? (
                    <p className="text-sm text-[#1A1A1A]/50">Checking availability...</p>
                  ) : availableTimeSlots.length === 0 ? (
                    <p className="text-sm text-[#1A1A1A]/50">No available time slots for this date</p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {availableTimeSlots.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setFormData({ ...formData, preferred_time: time })}
                        className={`p-2 text-sm rounded-lg border-2 transition-all ${
                          formData.preferred_time === time
                            ? "bg-[#B8956A] text-white border-[#B8956A]"
                            : "border-[#B8956A]/20 hover:border-[#B8956A] text-[#1A1A1A]"
                        }`}
                      >
                        {time}
                      </button>
                      ))}
                      </div>
                      )}
                      <p className="text-xs text-[#1A1A1A]/50 mt-2">
                      {isWeekend(new Date(formData.preferred_date))
                      ? "Weekend: All day availability (excluding booked times)"
                      : "Weekday: Available after 3:00 PM (excluding booked times)"}
                      </p>
                      </div>
                      )}

              <div>
                <label className="block text-sm font-medium text-[#1A1A1A] mb-2">
                  Additional Notes
                </label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className={cn("border-[#B8956A]/30 focus:border-[#B8956A] h-24", inputStyles)}
                  placeholder="Any special requests or details we should know..."
                />
              </div>

              {isEditing && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.is_cancellation}
                      onChange={(checked) => setFormData({ ...formData, is_cancellation: checked })}
                      className="border-red-300"
                    />
                    <span className="text-sm font-medium text-red-700">
                      I want to cancel this booking
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  className="flex-1 border-[#1A1A1A]/20"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white disabled:bg-[#1A1A1A]/50 disabled:cursor-not-allowed"
                  disabled={(!formData.preferred_date || !formData.preferred_time || isSubmitting) && !isEditing}
                >
                  {isSubmitting ? "Submitting..." : isEditing ? "Submit Change Request" : "Submit Booking Request"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}