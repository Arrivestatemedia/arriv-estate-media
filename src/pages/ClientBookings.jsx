import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar, Clock, MapPin, DollarSign, Edit2, Trash2 } from "lucide-react";

export default function ClientBookings() {
  const [user, setUser] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await base44.entities.Booking.delete(deleteId);
      setDeleteId(null);
    } catch (error) {
      console.error('Failed to delete booking:', error);
    }
  };

  if (!user) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold text-[#1A1A1A] mb-8">Your Booking Requests</h1>

        {isLoading ? (
          <p className="text-[#1A1A1A]/60">Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <Card className="border-2 border-[#B8956A]/20 text-center py-12">
            <p className="text-[#1A1A1A]/60 mb-4">You haven't submitted any booking requests yet</p>
            <Link to={createPageUrl('BookingPage')}>
              <Button className="bg-[#1A1A1A] hover:bg-[#1A1A1A]/90 text-white">
                Book a Shoot
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <Card key={booking.id} className="border-2 border-[#B8956A]/20 hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl text-[#1A1A1A]">{booking.property_address}</CardTitle>
                      <Badge className={`mt-2 ${statusColors[booking.status] || statusColors.pending}`}>
                        {booking.status?.toUpperCase() || 'PENDING'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[#B8956A] border-[#B8956A]/30"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-300"
                        onClick={() => setDeleteId(booking.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 text-[#1A1A1A]">
                      <Calendar className="w-5 h-5 text-[#B8956A]" />
                      <div>
                        <p className="text-sm text-[#1A1A1A]/60">Date</p>
                        <p className="font-semibold">{booking.preferred_date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[#1A1A1A]">
                      <Clock className="w-5 h-5 text-[#B8956A]" />
                      <div>
                        <p className="text-sm text-[#1A1A1A]/60">Time</p>
                        <p className="font-semibold">{booking.preferred_time}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[#1A1A1A]">
                      <DollarSign className="w-5 h-5 text-[#B8956A]" />
                      <div>
                        <p className="text-sm text-[#1A1A1A]/60">Total Price</p>
                        <p className="font-semibold">${booking.total_price}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[#1A1A1A]">
                      <p className="text-sm text-[#1A1A1A]/60">Package</p>
                      <p className="font-semibold capitalize">{booking.package?.replace('_', ' ')}</p>
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="bg-[#B8956A]/5 rounded p-3 border border-[#B8956A]/20">
                      <p className="text-sm text-[#1A1A1A]/60 mb-1">Notes</p>
                      <p className="text-[#1A1A1A]">{booking.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
    </div>
  );
}