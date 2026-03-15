import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Clock, MapPin, DollarSign, User, Phone, Trash2, Edit, CheckCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { createPageUrl } from "../utils";
import PullToRefresh from "@/components/shared/PullToRefresh";
import EditBookingDialog from "@/components/admin/EditBookingDialog";

export default function AdminBookings() {
  const [user, setUser] = useState(null);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [filter, setFilter] = useState('all');
    const [denyReason, setDenyReason] = useState('');
    const [showDenyModal, setShowDenyModal] = useState(false);
    const [loadingBookingId, setLoadingBookingId] = useState(null);
    const [selectedForDelete, setSelectedForDelete] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingBooking, setEditingBooking] = useState(null);
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [markingPaidId, setMarkingPaidId] = useState(null);
    const queryClient = useQueryClient();

  useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    if (userRole !== 'admin') {
      window.location.href = createPageUrl('Dashboard');
    } else {
      setUser({ role: userRole });
    }
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
    onSuccess: () => {
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
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
      queryClient.invalidateQueries({ queryKey: ['pendingBookings'] });
      queryClient.invalidateQueries({ queryKey: ['allBookings'] });
    },
    onSettled: () => {
      setLoadingBookingId(null);
      setSelectedBooking(null);
    }
  });

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    denied: "bg-red-100 text-red-800",
    completed: "bg-blue-100 text-blue-800"
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  const handleApprove = async () => {
    if (selectedBooking) {
      const updatedBooking = { ...selectedBooking, status: 'approved' };
      setLoadingBookingId(selectedBooking.id);
      
      try {
        await base44.functions.invoke('approveBooking', { bookingId: selectedBooking.id });
        queryClient.setQueryData(['adminBookings'], (old) => 
          old.map(b => b.id === selectedBooking.id ? updatedBooking : b)
        );
        setSelectedBooking(null);
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
    setLoadingBookingId(booking.id);
    try {
      if (booking.request_pay_at_closing && !booking.invoice_id) {
        // Pay-at-closing, no invoice yet: generate deposit invoice and lock
        await base44.functions.invoke('generatePayAtClosingInvoice', { bookingId: booking.id });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
        alert('Deposit invoice sent to client. Button will unlock after payment.');
      } else {
        // Pay-up-front (invoice already sent at booking submission) OR pay-at-closing after deposit paid
        await base44.functions.invoke('postBookingToJobBoard', { bookingId: booking.id });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to process request');
    } finally {
      setLoadingBookingId(null);
    }
  };

  const handleAcceptForMyself = async (booking) => {
    setLoadingBookingId(booking.id);
    try {
      if (booking.request_pay_at_closing && !booking.invoice_id) {
        // Pay-at-closing, no invoice yet: generate deposit invoice and lock
        await base44.functions.invoke('generatePayAtClosingInvoice', { bookingId: booking.id });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
        alert('Deposit invoice sent to client. Button will unlock after payment.');
      } else {
        // Pay-up-front (invoice already sent at booking submission) OR pay-at-closing after deposit paid
        await base44.functions.invoke('acceptBookingForMyself', { bookingId: booking.id });
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to process request');
    } finally {
      setLoadingBookingId(null);
    }
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
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
    queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
    queryClient.invalidateQueries({ queryKey: ['pendingBookings'] });
    queryClient.invalidateQueries({ queryKey: ['allBookings'] });
    setSelectedForDelete(new Set());
    setIsDeleting(false);
  };

  const deletableBookings = bookings.filter(b => b.status === 'approved' || b.status === 'denied' || b.status === 'pending');
  const allDeleteableSelected = deletableBookings.length > 0 && deletableBookings.every(b => selectedForDelete.has(b.id));

  const handleSelectAll = () => {
    if (allDeleteableSelected) {
      setSelectedForDelete(new Set());
    } else {
      const newSelected = new Set(deletableBookings.map(b => b.id));
      setSelectedForDelete(newSelected);
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
  };

  const handleEditBooking = (booking) => {
    setEditingBooking(booking);
    setShowEditDialog(true);
  };

  const handleManualMarkPaid = async (booking) => {
    if (!booking.invoice_id) {
      alert('No invoice linked to this booking. Cannot mark as paid.');
      return;
    }
    setMarkingPaidId(booking.id);
    try {
      const res = await base44.functions.invoke('manualMarkInvoicePaid', { invoiceId: booking.invoice_id });
      if (res.data?.success) {
        alert('Invoice marked as paid! Receipt has been sent to the client.');
        queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      } else {
        alert('Failed: ' + (res.data?.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleSaveBooking = async (formData) => {
    try {
      await base44.functions.invoke('updateBooking', {
        bookingId: editingBooking.id,
        updates: formData
      });
      queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
    } catch (error) {
      console.error('Failed to update booking:', error);
      alert('Failed to save booking changes');
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-[var(--bg-primary)] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-8">Booking Requests</h1>

        <div className="flex gap-2 mb-6 items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              onClick={() => setFilter('all')}
              className={filter === 'all' ? 'bg-[var(--text-primary)]' : 'border-[var(--border-color)]'}
            >
              All ({bookings.length})
            </Button>
            <Button
              variant={filter === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilter('pending')}
              className={filter === 'pending' ? 'bg-yellow-600' : 'border-[var(--border-color)]'}
            >
              Pending ({bookings.filter(b => b.status === 'pending').length})
            </Button>
            <Button
              variant={filter === 'approved' ? 'default' : 'outline'}
              onClick={() => setFilter('approved')}
              className={filter === 'approved' ? 'bg-green-600' : 'border-[var(--border-color)]'}
            >
              Approved ({bookings.filter(b => b.status === 'approved').length})
            </Button>
            <Button
              variant={filter === 'denied' ? 'default' : 'outline'}
              onClick={() => setFilter('denied')}
              className={filter === 'denied' ? 'bg-red-600' : 'border-[var(--border-color)]'}
            >
              Denied ({bookings.filter(b => b.status === 'denied').length})
            </Button>
            <Button
              variant={filter === 'completed' ? 'default' : 'outline'}
              onClick={() => setFilter('completed')}
              className={filter === 'completed' ? 'bg-blue-600' : 'border-[var(--border-color)]'}
            >
              Completed ({bookings.filter(b => b.status === 'completed').length})
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
          <p className="text-[var(--text-secondary)]">Loading bookings...</p>
        ) : filteredBookings.length === 0 ? (
          <Card className="border-2 border-[var(--border-color)] text-center py-12 bg-[var(--card-bg)]">
            <p className="text-[var(--text-secondary)]">No booking requests</p>
          </Card>
        ) : (
          <>
            {filteredBookings.length > 0 && (
              <div className="mb-4 flex items-center gap-2 p-3 bg-[var(--accent-color)]/5 rounded border border-[var(--border-color)]">
                <Checkbox
                  checked={allDeleteableSelected}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-sm text-[var(--text-secondary)]">Select all</span>
              </div>
            )}
            <div className="grid gap-4">
              {filteredBookings.map((booking) => (
                <Card
                  key={booking.id}
                  className="border-2 border-[var(--border-color)] hover:shadow-lg transition-shadow bg-[var(--card-bg)]"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-3">
                      <Checkbox
                        checked={selectedForDelete.has(booking.id)}
                        onCheckedChange={() => toggleSelectBooking(booking.id)}
                        className="mt-1"
                      />
                    <div className="flex-1">
                      <CardTitle className="text-lg text-[var(--text-primary)]">{booking.client_name}</CardTitle>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {booking.street_address || booking.property_address}, {booking.city}, {booking.state}
                      </p>
                    </div>
                    <Badge className={`${statusColors[booking.status] || statusColors.pending}`}>
                      {booking.status?.toUpperCase() || 'PENDING'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[var(--accent-color)]" />
                      <span className="text-[var(--text-secondary)]">{booking.client_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[var(--accent-color)]" />
                      <span className="text-[var(--text-secondary)]">{booking.client_phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-[var(--accent-color)]" />
                      <span className="text-[var(--text-secondary)]">{booking.preferred_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[var(--accent-color)]" />
                      <span className="text-[var(--text-secondary)] font-semibold">${booking.total_price}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleEditBooking(booking)}
                      variant="outline"
                      className="flex-1 border-[var(--border-color)]"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      onClick={() => setSelectedBooking(booking)}
                      variant="outline"
                      className="flex-1 border-[var(--border-color)]"
                    >
                      Details
                    </Button>
                    {booking.status === 'pending' && (
                      <>
                        <Button
                          onClick={() => handlePostToJobBoard(booking)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-blue-300 disabled:cursor-not-allowed"
                          disabled={loadingBookingId !== null || booking.payment_locked}
                        >
                          {loadingBookingId === booking.id ? 'Processing...' : 
                           booking.payment_locked ? (booking.request_pay_at_closing ? '🔒 Awaiting Deposit' : '🔒 Awaiting Payment') :
                           'Post to Job Board'}
                        </Button>
                        <Button
                          onClick={() => handleAcceptForMyself(booking)}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white disabled:bg-green-300 disabled:cursor-not-allowed"
                          disabled={loadingBookingId !== null || booking.payment_locked}
                        >
                          {loadingBookingId === booking.id ? 'Processing...' : 
                           booking.payment_locked ? (booking.request_pay_at_closing ? '🔒 Awaiting Deposit' : '🔒 Awaiting Payment') :
                           'Accept for Myself'}
                        </Button>
                        {booking.payment_locked && booking.invoice_id && (
                          <Button
                            onClick={() => handleManualMarkPaid(booking)}
                            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                            disabled={markingPaidId === booking.id}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {markingPaidId === booking.id ? 'Processing...' : 'Mark Paid'}
                          </Button>
                        )}
                        <Button
                          onClick={() => deleteMutation.mutate(booking.id)}
                          variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                          disabled={loadingBookingId !== null}
                        >
                          {loadingBookingId === booking.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </>
                    )}
                    {booking.status === 'approved' && (
                                          <Button
                                            onClick={() => {
                                              setLoadingBookingId(booking.id);
                                              base44.functions.invoke('revertBookingStatus', { bookingId: booking.id }).then(() => {
                                                queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
                                                queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
                                                queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
                                                setLoadingBookingId(null);
                                              }).catch(() => {
                                                queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
                                                queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
                                                queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
                                                setLoadingBookingId(null);
                                              });
                                            }}
                                            variant="outline"
                                            className="flex-1 border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                                            disabled={loadingBookingId !== null}
                                          >
                                            {loadingBookingId === booking.id ? 'Reverting...' : 'Revert to Pending'}
                                          </Button>
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
      </div>

      <Dialog open={!!selectedBooking && !showDenyModal} onOpenChange={(open) => {
        if (!open) {
          setSelectedBooking(null);
          setShowDenyModal(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedBooking.client_name}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div className="bg-[var(--accent-color)]/10 rounded-lg p-4 border border-[var(--border-color)]">
                  <Badge className={`${statusColors[selectedBooking.status] || statusColors.pending} mb-2`}>
                    {selectedBooking.status?.toUpperCase() || 'PENDING'}
                  </Badge>
                  <p className="text-xs text-[var(--text-secondary)] mt-2">ID: {selectedBooking.id}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-[var(--text-secondary)] mb-1">Property Address</p>
                    <p className="text-[var(--text-primary)] font-semibold">
                      {selectedBooking.street_address || selectedBooking.property_address}, {selectedBooking.city}, {selectedBooking.state}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Client Email</p>
                      <p className="text-[var(--text-primary)]">{selectedBooking.client_email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Phone</p>
                      <p className="text-[var(--text-primary)]">{selectedBooking.client_phone}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Preferred Date</p>
                      <p className="text-[var(--text-primary)] font-semibold">{selectedBooking.preferred_date}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Preferred Time</p>
                      <p className="text-[var(--text-primary)] font-semibold">{selectedBooking.preferred_time}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Package</p>
                      <p className="text-[var(--text-primary)] capitalize">{selectedBooking.package?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Total Price</p>
                      <p className="text-[var(--text-primary)] font-bold text-lg">${selectedBooking.total_price}</p>
                    </div>
                  </div>

                  {selectedBooking.add_ons && selectedBooking.add_ons.length > 0 && (
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-2">Add-Ons</p>
                      <ul className="space-y-1">
                        {selectedBooking.add_ons.map((addon) => (
                          <li key={addon} className="text-[var(--text-primary)] text-sm">• {addon}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedBooking.notes && (
                    <div>
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Notes</p>
                      <p className="text-[var(--text-primary)] bg-[var(--accent-color)]/5 p-3 rounded border border-[var(--border-color)]">
                        {selectedBooking.notes}
                      </p>
                    </div>
                  )}
                </div>

                {selectedBooking.status === 'pending' && (
                   <div className="flex gap-3 pt-4 border-t border-[var(--border-color)]">
                     <Button
                       onClick={handleDenyClick}
                       variant="outline"
                       className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                       disabled={loadingBookingId === selectedBooking.id}
                     >
                       Deny
                     </Button>
                     <Button
                       onClick={() => deleteMutation.mutate(selectedBooking.id)}
                       variant="outline"
                       className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                       disabled={loadingBookingId === selectedBooking.id}
                     >
                       {loadingBookingId === selectedBooking.id ? 'Deleting...' : 'Delete'}
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
                {selectedBooking.status === 'approved' && (
                  <div className="flex gap-3 pt-4 border-t border-[var(--border-color)]">
                    <Button
                      onClick={() => {
                        setLoadingBookingId(selectedBooking.id);
                        base44.functions.invoke('revertBookingStatus', { bookingId: selectedBooking.id }).then(() => {
                          queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
                          queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
                          queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
                          setSelectedBooking(null);
                          setLoadingBookingId(null);
                        }).catch(() => {
                          queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
                          queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "jobs" });
                          queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'media-partner-jobs' });
                          setLoadingBookingId(null);
                        });
                      }}
                      variant="outline"
                      className="flex-1 border-yellow-300 text-yellow-600 hover:bg-yellow-50 disabled:opacity-50"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      {loadingBookingId === selectedBooking.id ? 'Reverting...' : 'Revert to Pending'}
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate(selectedBooking.id)}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      {loadingBookingId === selectedBooking.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                )}
                {selectedBooking.status === 'denied' && (
                  <div className="flex gap-3 pt-4 border-t border-[var(--border-color)]">
                    <Button
                      onClick={() => deleteMutation.mutate(selectedBooking.id)}
                      variant="outline"
                      className="flex-1 border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={loadingBookingId === selectedBooking.id}
                    >
                      {loadingBookingId === selectedBooking.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDenyModal} onOpenChange={(open) => {
        if (!open) {
          setShowDenyModal(false);
          setDenyReason('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny Booking Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
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

      <EditBookingDialog 
        booking={editingBooking}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        onSave={handleSaveBooking}
      />
    </PullToRefresh>
  );
}