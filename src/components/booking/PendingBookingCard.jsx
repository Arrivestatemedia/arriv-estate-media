import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Clock, DollarSign, User, Mail, Phone } from "lucide-react";

export default function PendingBookingCard({ booking, onPostToJobBoard, onAcceptForMyself }) {
  return (
    <Card className="border-2 border-[#B8956A]/20 bg-white hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg text-[#1A1A1A]">
              {booking.property_address}
            </CardTitle>
            <Badge className="mt-2 bg-yellow-100 text-yellow-800 border-yellow-300">
              Pending Approval
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#B8956A]">${booking.total_price}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-[#1A1A1A]/70">
            <User className="w-4 h-4" />
            <span>{booking.client_name}</span>
          </div>
          <div className="flex items-center gap-2 text-[#1A1A1A]/70">
            <Mail className="w-4 h-4" />
            <span>{booking.client_email}</span>
          </div>
          {booking.client_phone && (
            <div className="flex items-center gap-2 text-[#1A1A1A]/70">
              <Phone className="w-4 h-4" />
              <span>{booking.client_phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-[#1A1A1A]/70">
            <Calendar className="w-4 h-4" />
            <span>{booking.preferred_date}</span>
          </div>
          <div className="flex items-center gap-2 text-[#1A1A1A]/70">
            <Clock className="w-4 h-4" />
            <span>{booking.preferred_time}</span>
          </div>
        </div>

        {booking.notes && (
          <div className="bg-[#B8956A]/5 rounded-lg p-3 text-sm text-[#1A1A1A]/70">
            <p className="font-medium text-[#1A1A1A] mb-1">Notes:</p>
            <p>{booking.notes}</p>
          </div>
        )}

        <div className="pt-2 space-y-2">
          <Button
            onClick={() => onPostToJobBoard(booking)}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            Post to Job Board
          </Button>
          <Button
            onClick={() => onAcceptForMyself(booking)}
            variant="outline"
            className="w-full border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A]/5"
          >
            Accept for Myself
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}