import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, Trash2, CalendarClock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { format, isWeekend } from "date-fns";

const packages = [
  { id: "mls_walkthrough", name: "MLS Walkthrough", price: 100 },
  { id: "photo_essentials", name: "Photo Essentials", price: 275 },
  { id: "photo_cinematic", name: "Photo + Cinematic Walkthrough", price: 475 },
  { id: "premium_bundle", name: "Premium Media Bundle", price: 675 },
];

const addOns = [
  { id: "drone", name: "Drone add-on", price: 125 },
  { id: "3d_tour", name: "3D Tour", price: 125 },
  { id: "twilight", name: "Twilight exterior edits", price: 125 },
  { id: "rush_delivery", name: "Next-day rush delivery", price: 100 },
  { id: "vertical_reel", name: "Additional vertical reel", price: 40 },
  { id: "ai_staging", name: "AI Staging", price: 125 },
];

const timeSlots = {
  weekday: ["3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM"],
  weekend: ["9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM","12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM"],
};

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  submitted: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function AdminScheduledBookings() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(null);
  const [scheduleTime, setScheduleTime] = useState("");
  const [form, setForm] = useState({
    package_id: "",
    add_on_ids: [],
    request_pay_at_closing: false,
    client_name: "",
    client_email: "",
    client_phone: "",
    street_address: "",
    city: "",
    state: "",
    preferred_date: "",
    preferred_time: "",
    notes: "",
  });

  // Verify admin
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const role = localStorage.getItem('user_role') || sessionStorage.getItem('user_role');
    if (role === 'admin') setIsAdmin(true);
    else base44.auth.me().then(u => { if (u?.role === 'admin') setIsAdmin(true); }).catch(() => {});
  }, []);

  const { data: scheduledBookings = [], isLoading } = useQuery({
    queryKey: ['scheduledBookings'],
    queryFn: () => base44.entities.ScheduledBooking.list('-created_date', 50),
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ScheduledBooking.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledBookings'] });
      setShowForm(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ScheduledBooking.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduledBookings'] }),
  });

  const resetForm = () => {
    setForm({ package_id: "", add_on_ids: [], request_pay_at_closing: false, client_name: "", client_email: "", client_phone: "", street_address: "", city: "", state: "", preferred_date: "", preferred_time: "", notes: "" });
    setSelectedDate(null);
    setScheduleDate(null);
    setScheduleTime("");
  };

  const handleShootDateSelect = (date) => {
    if (!date) return;
    const y = date.getFullYear(), m = String(date.getMonth()+1).padStart(2,'0'), d = String(date.getDate()).padStart(2,'0');
    setSelectedDate(date);
    setForm(prev => ({ ...prev, preferred_date: `${y}-${m}-${d}`, preferred_time: "" }));
  };

  const handleScheduleDateSelect = (date) => {
    setScheduleDate(date);
  };

  const toggleAddOn = (id) => {
    setForm(prev => ({
      ...prev,
      add_on_ids: prev.add_on_ids.includes(id)
        ? prev.add_on_ids.filter(a => a !== id)
        : [...prev.add_on_ids, id],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!scheduleDate || !scheduleTime) return alert("Please select a scheduled submit date and time.");
    if (!form.package_id) return alert("Please select a package.");
    if (!form.preferred_date || !form.preferred_time) return alert("Please select the shoot date and time.");

    const [h, mAndPeriod] = scheduleTime.split(':');
    const [min, period] = mAndPeriod.split(' ');
    let hours = parseInt(h);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const scheduled_submit_at = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate(), hours, parseInt(min)).toISOString();

    createMutation.mutate({ ...form, scheduled_submit_at });
  };

  const availableShootSlots = form.preferred_date
    ? (() => {
        const [y,m,d] = form.preferred_date.split('-').map(Number);
        return isWeekend(new Date(y,m-1,d)) ? timeSlots.weekend : timeSlots.weekday;
      })()
    : [];

  if (!isAdmin) return (
    <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
      <p className="text-[#1A1A1A]/60">Admin access required.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1A1A] flex items-center gap-3">
              <CalendarClock className="w-8 h-8 text-[#B8956A]" />
              Scheduled Bookings
            </h1>
            <p className="text-[#1A1A1A]/60 mt-1">Pre-schedule booking submissions for a specific date and time.</p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Scheduled Booking
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" /></div>
        ) : scheduledBookings.length === 0 ? (
          <Card className="border-2 border-[#B8956A]/20">
            <CardContent className="py-12 text-center text-[#1A1A1A]/50">
              No scheduled bookings yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {scheduledBookings.map((sb) => {
              const pkg = packages.find(p => p.id === sb.package_id);
              const selectedAddOns = (sb.add_on_ids || []).map(id => addOns.find(a => a.id === id)?.name).filter(Boolean);
              return (
                <Card key={sb.id} className="border-2 border-[#B8956A]/20">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold text-[#1A1A1A]">{sb.client_name}</span>
                          <Badge className={statusColors[sb.status]}>{sb.status}</Badge>
                          {pkg && <Badge variant="outline">{pkg.name}</Badge>}
                        </div>
                        <div className="text-sm text-[#1A1A1A]/60 space-y-1">
                          <p><Clock className="w-3 h-3 inline mr-1" /><strong>Submit at:</strong> {format(new Date(sb.scheduled_submit_at), "MMM d, yyyy 'at' h:mm a")}</p>
                          <p><strong>Shoot:</strong> {sb.preferred_date} at {sb.preferred_time}</p>
                          <p><strong>Address:</strong> {sb.street_address}, {sb.city}, {sb.state}</p>
                          {selectedAddOns.length > 0 && <p><strong>Add-ons:</strong> {selectedAddOns.join(", ")}</p>}
                          {sb.notes && <p><strong>Notes:</strong> {sb.notes}</p>}
                          {sb.status === 'submitted' && sb.submitted_booking_id && (
                            <p className="text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Booking created: #{sb.submitted_booking_id.slice(0,8)}</p>
                          )}
                          {sb.status === 'failed' && sb.error_message && (
                            <p className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> {sb.error_message}</p>
                          )}
                        </div>
                      </div>
                      {sb.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(sb.id)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Schedule a Booking Submission</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">

            {/* When to auto-submit */}
            <div className="bg-[#B8956A]/10 rounded-lg p-4 border border-[#B8956A]/30 space-y-3">
              <p className="font-semibold text-[#1A1A1A] flex items-center gap-2"><CalendarClock className="w-4 h-4 text-[#B8956A]" /> When to Auto-Submit</p>
              <Calendar
                mode="single"
                selected={scheduleDate}
                onSelect={handleScheduleDateSelect}
                disabled={(d) => d < new Date()}
                className="border border-[#B8956A]/20 rounded-lg p-2 bg-white"
              />
              {scheduleDate && (
                <div>
                  <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Time to submit</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM"].map(t => (
                      <button key={t} type="button" onClick={() => setScheduleTime(t)}
                        className={`p-2 text-xs rounded-lg border-2 transition-all ${scheduleTime === t ? "bg-[#B8956A] text-white border-[#B8956A]" : "border-[#B8956A]/20 hover:border-[#B8956A] text-[#1A1A1A]"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Package */}
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Package *</label>
              <Select value={form.package_id} onValueChange={(v) => setForm(prev => ({ ...prev, package_id: v }))}>
                <SelectTrigger className="border-[#B8956A]/30"><SelectValue placeholder="Select a package" /></SelectTrigger>
                <SelectContent>
                  {packages.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — ${p.price}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Add-ons */}
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Add-ons</label>
              <div className="flex flex-wrap gap-2">
                {addOns.map(a => (
                  <button key={a.id} type="button" onClick={() => toggleAddOn(a.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border-2 transition-all ${form.add_on_ids.includes(a.id) ? "bg-[#B8956A] text-white border-[#B8956A]" : "border-[#B8956A]/30 text-[#1A1A1A] hover:border-[#B8956A]"}`}>
                    {a.name} (+${a.price})
                  </button>
                ))}
              </div>
            </div>

            {/* Client info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Client Name *</label>
                <Input required value={form.client_name} onChange={e => setForm(p=>({...p,client_name:e.target.value}))} className="border-[#B8956A]/30" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Client Email *</label>
                <Input required type="email" value={form.client_email} onChange={e => setForm(p=>({...p,client_email:e.target.value}))} className="border-[#B8956A]/30" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Client Phone</label>
                <Input value={form.client_phone} onChange={e => setForm(p=>({...p,client_phone:e.target.value}))} className="border-[#B8956A]/30" />
              </div>
            </div>

            {/* Address */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Street Address *</label>
                <Input required value={form.street_address} onChange={e => setForm(p=>({...p,street_address:e.target.value}))} className="border-[#B8956A]/30" placeholder="123 Main St" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">City *</label>
                <Input required value={form.city} onChange={e => setForm(p=>({...p,city:e.target.value}))} className="border-[#B8956A]/30" />
              </div>
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">State *</label>
                <Input required maxLength="2" value={form.state} onChange={e => setForm(p=>({...p,state:e.target.value.toUpperCase()}))} className="border-[#B8956A]/30" placeholder="GA" />
              </div>
            </div>

            {/* Shoot date & time */}
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Preferred Shoot Date *</label>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleShootDateSelect}
                disabled={(d) => d < new Date()}
                className="border border-[#B8956A]/20 rounded-lg p-2"
              />
            </div>
            {form.preferred_date && (
              <div>
                <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Shoot Time *</label>
                <div className="grid grid-cols-4 gap-2">
                  {availableShootSlots.map(t => (
                    <button key={t} type="button" onClick={() => setForm(p=>({...p,preferred_time:t}))}
                      className={`p-2 text-xs rounded-lg border-2 transition-all ${form.preferred_time===t ? "bg-[#B8956A] text-white border-[#B8956A]" : "border-[#B8956A]/20 hover:border-[#B8956A] text-[#1A1A1A]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Notes</label>
              <Textarea value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} className="border-[#B8956A]/30 h-20" placeholder="Any special instructions..." />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="pac" checked={form.request_pay_at_closing} onChange={e => setForm(p=>({...p,request_pay_at_closing:e.target.checked}))} className="accent-[#B8956A]" />
              <label htmlFor="pac" className="text-sm text-[#1A1A1A]/70 cursor-pointer">Request Pay-at-Closing</label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex-1 bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white">
                {createMutation.isPending ? "Scheduling..." : "Schedule Booking"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}