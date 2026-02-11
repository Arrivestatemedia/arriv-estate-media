import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, DollarSign, User, Phone, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { createPageUrl } from "../utils";

export default function AdminBookings() {
  const [user, setUser] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [filter, setFilter] = useState('all');
    const [denyReason, setDenyReason] = useState('');
    const [showDenyModal, setShowDenyModal] = useState(false);
    const [loadingBookingId, setLoadingBookingId] = useState(null);
    const [selectedForDelete, setSelectedForDelete] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
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

  const postToJobBoardMutation = useMutation({
    mutationFn: async (bookingId) => {
      await base44.functions.invoke('postBookingToJobBoard', { bookingId });
      return bookingId;
    },
    onMutate: async (bookingId) => {
      setLoadingBookingId(bookingId);
      queryClient.setQueryData(['adminBookings'], (old) =>
        old.map(b => b.id === bookingId ? { ...b, status: 'approved' } : b)
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    },
    onSettled: () => {
      setLoadingBookingId(null);
    }
  });

  const acceptForMyselfMutation = useMutation({
    mutationFn: async (bookingId) => {
      await base44.functions.invoke('acceptBookingForMyself', { bookingId });
      return bookingId;
    },
    onMutate: async (bookingId) => {
      setLoadingBookingId(bookingId);
      queryClient.setQueryData(['adminBookings'], (old) =>
        old.map(b => b.id === bookingId ? { ...b, status: 'approved' } : b)
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    },
    onSettled: () => {
      setLoadingBookingId(null);
    }
  });

  const denyMutation = useMutation({
    mutationFn: async ({ bookingId, reason }) => {
      await base44.functions.invoke('denyBooking', { bookingId, reason });
      return bookingId;
    },
    onMutate: async ({ bookingId }) => {
      setLoadingBookingId(bookingId);
      queryClient.setQueryData(['adminBookings'], (old) =>
        old.map(b => b.id === bookingId ? { ...b, status: 'denied' } : b)
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    },
    onSettled: () => {
      setLoadingBookingId(null);
      setSelectedBooking(null);
      setShowDenyModal(false);
      setDenyReason('');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (bookingId) => {
      await base44.functions.invoke('deleteBooking', { bookingId });
      return bookingId;
    },
    onMutate: async (bookingId) => {
      setLoadingBookingId(bookingId);
      queryClient.setQueryData(['adminBookings'], (old) =>
        old.filter(b => b.id !== bookingId)
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    },
    onSettled: () => {
      setLoadingBookingId(null);
      setSelectedBooking(null);
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
      const updatedBooking = { ...selectedBooking, status: 'approved' };
      setSelectedBooking(updatedBooking);
      queryClient.setQueryData(['adminBookings'], (old) => 
        old.map(b => b.id === selectedBooking.id ? updatedBooking : b)
      );
      setLoadingBookingId(selectedBooking.id);
      
      try {
        await base44.functions.invoke('approveBooking', { bookingId: selectedBooking.id });
      } catch (error) {
        console.error('Failed to approve booking:', error);
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
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
      denyMutation.mutate({ bookingId: selectedBooking.id, reason: denyReason });
    }
  };

  const handlePostToJobBoard = async (booking) => {
    postToJobBoardMutation.mutate(booking.id);
  };

  const handleAcceptForMyself = async (booking) => {
    acceptForMyselfMutation.mutate(booking.id);
  };

  const toggleSelectBooking = (bookingId) => {
    const newSelected = new Set(selectedForDelete);
    if (newSelected.has(bookingId)) {
      newSelected.delete(bookingId);
    } else {
      newSelected.add(bookingId);
    }
    setSelectedForDelete(newSelected);
  };

  const handleBatchDelete = async () => {
    setIsDeleting(true);
    for (const bookingId of selectedForDelete) {
      await base44.functions.invoke('deleteBooking', { bookingId });
    }
    queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    setSelectedForDelete(new Set());
    setIsDeleting(false);
  };

  const deletableBookings = bookings.filter(b => b.status === 'approved' || b.status === 'denied');
  const allDeleteableSelected = deletableBookings.length > 0 && deletableBookings.every(b => selectedForDelete.has(b.id));

  const handleSelectAll = () => {
    if (allDeleteableSelected) {
      setSelectedForDelete(new Set());
    } else {
      const newSelected = new Set(deletableBookings.map(b => b.id));
      setSelectedForDelete(newSelected);
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-[#1A1A1A] mb-8">Booking Requests</h1>

        <div className="flex gap-2 mb-6 items-center justify-between">
          <div className="flex gap-2">
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
          {selectedForDelete.size > 0 && (
            <Button
              onClick={handleBatchDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Deleting...' : `Delete ${selectedForDelete.size}`}
            </Button>
          )}
        </div>

        {isLoading ? (
          <p className="text-[#1A1A1A]/60">Loading bookings...</p>
        ) : filteredBookings.length === 0 ? (
          <Card className="border-2 border-[#B8956A]/20 text-center py-12">
            <p className="text-[#1A1A1A]/60">No booking requests</p>
          </Card>
        ) : (
          <>
            {deletableBookings.length > 0 && (
              <div className="mb-4 flex items-center gap-2 p-3 bg-[#B8956A]/5 rounded border border-[#B8956A]/20">
                <Checkbox
                  checked={allDeleteableSelected}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm text-[#1A1A1A]/70">Select all deletable bookings</span>
              </div>
            )}
            <div className="grid gap-4">
              {filteredBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="border-2 border-[#B8956A]/20 hover:shadow-lg transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-3">
                      {(booking.status === 'approved' || booking.status === 'denied') && (
                        <Checkbox
                          checked={selectedForDelete.has(booking.id)}
                          onCheckedChange={() => toggleSelectBooking(booking.id)}
                          className="mt-1"
                        />
                      )}
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
                    {booking.status === 'pending' && (
                      <>
                        <Button
                          onClick={() => handlePostToJobBoard(booking)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300 disabled:cursor-not-allowed"
                          disabled={loadingBookingId !== null}
                        >
                          {loadingBookingId === booking.id ? 'Posting...' : 'Post to Job Board'}
                        </Button>
                        <Button
                          onClick={() => handleAcceptForMyself(booking)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:bg-green-300 disabled:cursor-not-allowed"
                          disabled={loadingBookingId !== null}
                        >
                          {loadingBookingId === booking.id ? 'Accepting...' : 'Accept for Myself'}
                        </Button>
                      </>
                    )}
                    {(booking.status === 'approved' || booking.status === 'denied') && (
                      <Button
                        onClick={() => deleteMutation.mutate(booking.id)}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        disabled={loadingBookingId !== null}
                      >
                        {loadingBookingId === booking.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            </div>
            </>
            )}
      </div>

      <Dialog open={!!selectedBooking && !showDenyModal} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedBooking.client_name}</DialogTitle>
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
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      Deny
                    </Button>
                    <Button
                      onClick={handleApprove}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:bg-green-400"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      {loadingBookingId === selectedBooking.id ? 'Approving...' : 'Approve'}
                    </Button>
                  </div>
                )}
                {(selectedBooking.status === 'approved' || selectedBooking.status === 'denied') && (
                  <div className="flex gap-3 pt-4 border-t border-[#B8956A]/20">
                    <Button
                      onClick={() => deleteMutation.mutate(selectedBooking.id)}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      {loadingBookingId === selectedBooking.id ? 'Deleting...' : 'Delete Booking'}
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