import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar, Clock, MapPin, DollarSign, Edit2, Trash2 } from "lucide-react";
import PullToRefresh from "@/components/shared/PullToRefresh";

export default function ClientBookings() {
  const [user, setUser] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const userEmail = localStorage.getItem('user_email');
    if (userEmail) {
      setUser({ email: userEmail });
    }
  }, []);

  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ['bookings', user?.email],
    queryFn: () => {
      if (!user?.email) return [];
      return base44.entities.Booking.filter({ client_email: user.email }, '-created_date');
    },
    enabled: !!user?.email
  });

  useEffect(() => {
    if (!user?.email) return;
    
    // Subscribe to real-time booking updates
    const unsubscribe = base44.entities.Booking.subscribe((event) => {
      if (event.type === 'create' && event.data?.client_email === user.email) {
        refetch();
      }
    });

    return unsubscribe;
  }, [user?.email, refetch]);



  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    denied: "bg-red-100 text-red-800"
  };



  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['bookings', user?.email] });
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen bg-[var(--bg-primary)] py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-8">Your Booking Requests</h1>

        {isLoading ? (
          <p className="text-[var(--text-secondary)]">Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <Card className="border-2 border-[var(--border-color)] text-center py-12">
            <p className="text-[var(--text-secondary)] mb-4">You haven't submitted any booking requests yet</p>
            <Link to={createPageUrl('BookingPage')}>
              <Button className="bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] text-white">
                Book a Shoot
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="border-2 border-[var(--border-color)] hover:shadow-lg transition-shadow bg-[var(--card-bg)]">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl text-[var(--text-primary)]">{booking.property_address}</CardTitle>
                      <Badge className={`mt-2 ${statusColors[booking.status] || statusColors.pending}`}>
                        {booking.status?.toUpperCase() || 'PENDING'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Link to={createPageUrl('BookingPage') + '?booking_id=' + booking.id}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[var(--accent-color)] border-[var(--border-color)]"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <Calendar className="w-5 h-5 text-[var(--accent-color)]" />
                      <div>
                        <p className="text-sm text-[var(--text-secondary)]">Date</p>
                        <p className="font-semibold">{booking.preferred_date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <Clock className="w-5 h-5 text-[var(--accent-color)]" />
                      <div>
                        <p className="text-sm text-[var(--text-secondary)]">Time</p>
                        <p className="font-semibold">{booking.preferred_time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <DollarSign className="w-5 h-5 text-[var(--accent-color)]" />
                      <div>
                        <p className="text-sm text-[var(--text-secondary)]">Total Price</p>
                        <p className="font-semibold">${booking.total_price}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[var(--text-primary)]">
                      <p className="text-sm text-[var(--text-secondary)]">Package</p>
                      <p className="font-semibold capitalize">{booking.package?.replace('_', ' ')}</p>
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="bg-[var(--accent-color)]/5 rounded p-3 border border-[var(--border-color)]">
                      <p className="text-sm text-[var(--text-secondary)] mb-1">Notes</p>
                      <p className="text-[var(--text-primary)]">{booking.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking Request?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The booking request will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </PullToRefresh>
  );
}