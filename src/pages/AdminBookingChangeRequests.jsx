import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminBookingChangeRequests() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' or 'deny'
  const queryClient = useQueryClient();

  const { data: changeRequests = [], isLoading } = useQuery({
    queryKey: ["bookingChangeRequests"],
    queryFn: () => base44.entities.BookingChangeRequest.list(),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId) => base44.functions.invoke('approveBookingChangeRequest', { requestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingChangeRequests"] });
      setSelectedRequest(null);
      setActionType(null);
    },
  });

  const denyMutation = useMutation({
    mutationFn: (requestId) => base44.functions.invoke('denyBookingChangeRequest', { requestId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookingChangeRequests"] });
      setSelectedRequest(null);
      setActionType(null);
    },
  });

  const pendingRequests = changeRequests.filter(r => r.status === 'pending');
  const processedRequests = changeRequests.filter(r => r.status !== 'pending');

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'denied':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Booking Change Requests</h1>
          <p className="text-[#1A1A1A]/60">Review and approve/deny client requests to modify their bookings</p>
        </div>

        {isLoading ? (
          <p className="text-[#1A1A1A]/60">Loading...</p>
        ) : (
          <>
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  Pending Requests ({pendingRequests.length})
                </h2>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <Card key={request.id} className="border-2 border-yellow-200 bg-yellow-50/30">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <CardTitle className="text-lg text-[#1A1A1A]">
                              {request.client_name}
                            </CardTitle>
                            <p className="text-sm text-[#1A1A1A]/60 mt-1">{request.client_email}</p>
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white/60 rounded p-3">
                            <p className="text-xs text-[#1A1A1A]/60 font-medium">Original Booking</p>
                            <p className="text-sm text-[#1A1A1A] font-semibold">
                              {format(new Date(request.original_date), 'MMM d, yyyy')} at {request.original_time}
                            </p>
                          </div>
                          {!request.is_cancellation && (
                            <div className="bg-white/60 rounded p-3">
                              <p className="text-xs text-[#1A1A1A]/60 font-medium">Requested Change</p>
                              <p className="text-sm text-[#1A1A1A] font-semibold">
                                {format(new Date(request.requested_date), 'MMM d, yyyy')} at {request.requested_time}
                              </p>
                            </div>
                          )}
                        </div>

                        {request.is_cancellation && (
                          <div className="bg-red-50 border border-red-200 rounded p-3">
                            <p className="text-sm font-medium text-red-700">This is a cancellation request</p>
                          </div>
                        )}

                        {request.notes && (
                          <div className="bg-white/60 rounded p-3">
                            <p className="text-xs text-[#1A1A1A]/60 font-medium mb-1">Client Notes</p>
                            <p className="text-sm text-[#1A1A1A]">{request.notes}</p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-4">
                          <Button
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType('approve');
                            }}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
                          >
                            <Check className="w-4 h-4" />
                            Approve
                          </Button>
                          <Button
                            onClick={() => {
                              setSelectedRequest(request);
                              setActionType('deny');
                            }}
                            variant="outline"
                            className="flex-1 border-red-300 text-red-600 hover:bg-red-50 gap-2"
                          >
                            <X className="w-4 h-4" />
                            Deny
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Processed Requests */}
            {processedRequests.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-[#1A1A1A] mb-4">Processed Requests</h2>
                <div className="space-y-2">
                  {processedRequests.map((request) => (
                    <Card key={request.id} className="opacity-75">
                      <CardContent className="pt-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-[#1A1A1A]">{request.client_name}</p>
                            <p className="text-sm text-[#1A1A1A]/60">
                              {format(new Date(request.original_date), 'MMM d, yyyy')}
                              {request.requested_date && ` → ${format(new Date(request.requested_date), 'MMM d, yyyy')}`}
                            </p>
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {changeRequests.length === 0 && (
              <Card className="border-2 border-dashed border-[#B8956A]/30">
                <CardContent className="pt-12 pb-12 text-center">
                  <p className="text-[#1A1A1A]/60">No change requests yet</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedRequest && !!actionType} onOpenChange={() => {
        setSelectedRequest(null);
        setActionType(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? 'Approve Change Request?' : 'Deny Change Request?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve'
                ? selectedRequest?.is_cancellation
                  ? 'This will approve the cancellation and notify the client.'
                  : 'This will approve the date/time change and update their booking.'
                : 'This will deny the request and notify the client.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialog.Footer>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (actionType === 'approve') {
                  approveMutation.mutate(selectedRequest.id);
                } else {
                  denyMutation.mutate(selectedRequest.id);
                }
              }}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {actionType === 'approve' ? 'Approve' : 'Deny'}
            </AlertDialogAction>
          </AlertDialog.Footer>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}