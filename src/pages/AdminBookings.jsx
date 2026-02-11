import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, DollarSign, User, Phone } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { createPageUrl } from "../utils";

export default function AdminBookings() {
  const [user, setUser] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [filter, setFilter] = useState('all');
    const [denyReason, setDenyReason] = useState('');
    const [showDenyModal, setShowDenyModal] = useState(false);
    const [loadingBookingId, setLoadingBookingId] = useState(null);
    const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then((userData) => {
      if (userData?.role !== 'admin') {
        window.location.href = createPageUrl('Dashboard');
      } else {
        setUser(userData);
      }
    }).catch(() => {
      window.location.href = createPageUrl('Dashboard');
    });
  }, []);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['adminBookings'],
    queryFn: () => base44.entities.Booking.list('-created_date'),
    enabled: !!user
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, reason }) => 
      base44.asServiceRole.entities.Booking.update(id, { status }).then(async (booking) => {
        // Send status email
        try {
          await base44.functions.invoke('sendBookingStatusEmail', {
            clientEmail: booking.client_email,
            clientName: booking.client_name,
            status: status,
            reason: reason,
            propertyAddress: booking.property_address
          });
        } catch (error) {
          console.error('Failed to send status email:', error);
        }
        return booking;
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      setSelectedBooking(null);
      setShowDenyModal(false);
      setDenyReason('');
    }
  });

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    denied: "bg-red-100 text-red-800"
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const handleApprove = async () => {
    if (selectedBooking) {
      setLoadingBookingId(selectedBooking.id);
      try {
        await base44.functions.invoke('approveBooking', { bookingId: selectedBooking.id });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
        setSelectedBooking(null);
      } catch (error) {
        console.error('Failed to approve booking:', error);
      } finally {
        setLoadingBookingId(null);
      }
    }
  };

  const handleDenyClick = () => {
    setShowDenyModal(true);
  };

  const handleDenySubmit = async () => {
    if (selectedBooking) {
      setLoadingBookingId(selectedBooking.id);
      try {
        await base44.functions.invoke('denyBooking', { bookingId: selectedBooking.id, reason: denyReason });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
        setSelectedBooking(null);
        setShowDenyModal(false);
        setDenyReason('');
      } catch (error) {
        console.error('Failed to deny booking:', error);
      } finally {
        setLoadingBookingId(null);
      }
    }
  };

  const handlePostToJobBoard = async (booking) => {
    try {
      await base44.functions.invoke('postBookingToJobBoard', { bookingId: booking.id });
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    } catch (error) {
      console.error('Failed to post to job board:', error);
    }
  };

  const handleAcceptForMyself = async (booking) => {
    try {
      await base44.functions.invoke('acceptBookingForMyself', { bookingId: booking.id });
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    } catch (error) {
      console.error('Failed to accept booking:', error);
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-[#1A1A1A] mb-8">Booking Requests</h1>

        <div className="flex gap-2 mb-6">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-[#1A1A1A]' : 'border-[#B8956A]/30'}
          >
            All ({bookings.length})
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilter('pending')}
            className={filter === 'pending' ? 'bg-yellow-600' : 'border-[#B8956A]/30'}
          >
            Pending ({bookings.filter(b => b.status === 'pending').length})
          </Button>
          <Button
            variant={filter === 'approved' ? 'default' : 'outline'}
            onClick={() => setFilter('approved')}
            className={filter === 'approved' ? 'bg-green-600' : 'border-[#B8956A]/30'}
          >
            Approved ({bookings.filter(b => b.status === 'approved').length})
          </Button>
          <Button
            variant={filter === 'denied' ? 'default' : 'outline'}
            onClick={() => setFilter('denied')}
            className={filter === 'denied' ? 'bg-red-600' : 'border-[#B8956A]/30'}
          >
            Denied ({bookings.filter(b => b.status === 'denied').length})
          </Button>
        </div>

        {isLoading ? (
          <p className="text-[#1A1A1A]/60">Loading bookings...</p>
        ) : filteredBookings.length === 0 ? (
          <Card className="border-2 border-[#B8956A]/20 text-center py-12">
            <p className="text-[#1A1A1A]/60">No booking requests</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredBookings.map((booking) => (
              <Card
                key={booking.id}
                className="border-2 border-[#B8956A]/20 hover:shadow-lg transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-lg text-[#1A1A1A]">{booking.client_name}</CardTitle>
                      <p className="text-sm text-[#1A1A1A]/60 mt-1">{booking.property_address}</p>
                    </div>
                    <Badge className={`${statusColors[booking.status] || statusColors.pending}`}>
                      {booking.status?.toUpperCase() || 'PENDING'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[#B8956A]" />
                      <span className="text-[#1A1A1A]/60">{booking.client_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#B8956A]" />
                      <span className="text-[#1A1A1A]/60">{booking.client_phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[#B8956A]" />
                      <span className="text-[#1A1A1A]/60">{booking.preferred_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[#B8956A]" />
                      <span className="text-[#1A1A1A]/60 font-semibold">${booking.total_price}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setSelectedBooking(booking)}
                      variant="outline"
                      className="flex-1 border-[#B8956A]/30"
                    >
                      Details
                    </Button>
                    <Button
                      onClick={() => handlePostToJobBoard(booking)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Post to Job Board
                    </Button>
                    <Button
                      onClick={() => handleAcceptForMyself(booking)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      Accept for Myself
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedBooking && !showDenyModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader className="flex justify-between items-center">
                <DialogTitle className="text-2xl">{selectedBooking.client_name}</DialogTitle>
                <button onClick={() => setSelectedBooking(null)} className="text-2xl cursor-pointer">×</button>
              </DialogHeader>

              <div className="space-y-6">
                <div className="bg-[#B8956A]/10 rounded-lg p-4 border border-[#B8956A]/20">
                  <Badge className={`${statusColors[selectedBooking.status] || statusColors.pending} mb-2`}>
                    {selectedBooking.status?.toUpperCase() || 'PENDING'}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-[#1A1A1A]/60 mb-1">Property Address</p>
                    <p className="text-[#1A1A1A] font-semibold">{selectedBooking.property_address}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Client Email</p>
                      <p className="text-[#1A1A1A]">{selectedBooking.client_email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Phone</p>
                      <p className="text-[#1A1A1A]">{selectedBooking.client_phone}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Preferred Date</p>
                      <p className="text-[#1A1A1A] font-semibold">{selectedBooking.preferred_date}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Preferred Time</p>
                      <p className="text-[#1A1A1A] font-semibold">{selectedBooking.preferred_time}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Package</p>
                      <p className="text-[#1A1A1A] capitalize">{selectedBooking.package?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Total Price</p>
                      <p className="text-[#1A1A1A] font-bold text-lg">${selectedBooking.total_price}</p>
                    </div>
                  </div>

                  {selectedBooking.add_ons && selectedBooking.add_ons.length > 0 && (
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-2">Add-Ons</p>
                      <ul className="space-y-1">
                        {selectedBooking.add_ons.map((addon) => (
                          <li key={addon} className="text-[#1A1A1A] text-sm">• {addon}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedBooking.notes && (
                    <div>
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Notes</p>
                      <p className="text-[#1A1A1A] bg-[#B8956A]/5 p-3 rounded border border-[#B8956A]/20">
                        {selectedBooking.notes}
                      </p>
                    </div>
                  )}
                </div>

                {selectedBooking.status === 'pending' && (
                  <div className="flex gap-3 pt-4 border-t border-[#B8956A]/20">
                    <Button
                      onClick={handleDenyClick}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                    >
                      Deny
                    </Button>
                    <Button
                      onClick={handleApprove}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDenyModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny Booking Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[#1A1A1A]/70">
              Please provide a reason for denying this booking. This will be sent to the customer.
            </p>
            <Textarea
              placeholder="Enter reason (optional)..."
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              className="h-24"
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowDenyModal(false); setDenyReason(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDenySubmit}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                Deny Booking
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}