import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Clock, DollarSign, Camera, Video, Film } from "lucide-react";
import { format, parse as parseDate } from "date-fns";
import { toZonedTime } from "npm:date-fns-tz@3.0.0";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";

const typeConfig = {
  photo: { label: "Photo", icon: Camera, color: "bg-[#B8956A]/10 text-[#B8956A] border-[#B8956A]/30" },
  video: { label: "Video", icon: Video, color: "bg-[#B8956A]/10 text-[#B8956A] border-[#B8956A]/30" },
  photo_video: { label: "Photo + Video", icon: Film, color: "bg-[#B8956A]/20 text-[#B8956A] border-[#B8956A]/40" },
};

const statusConfig = {
  open: { label: "Open", color: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  booked: { label: "Booked", color: "bg-blue-50 text-blue-700 border-blue-300" },
  in_progress: { label: "In Progress", color: "bg-amber-50 text-amber-700 border-amber-300" },
  completed: { label: "Completed", color: "bg-gray-100 text-gray-600 border-gray-300" },
  cancelled: { label: "Cancelled", color: "bg-red-50 text-red-600 border-red-300" },
};

export default function JobCard({ job, isAdmin, onBook, onManage, onCancel, onBookBackup, currentUserEmail, onUpdateBackup, userRole }) {
  const type = typeConfig[job.type] || typeConfig.photo;
  const status = statusConfig[job.status] || statusConfig.open;
  const TypeIcon = type.icon;
  const isBookedByMe = job.booked_by === currentUserEmail;
  const isBackupByMe = job.backup_booked_by === currentUserEmail;
  const [showPhoneInput, setShowPhoneInput] = React.useState(false);
  const [backupPhone, setBackupPhone] = React.useState(job.backup_booked_by_phone || '');
  
  // Show client pricing to admins, contractor pricing to media partners
  const displayPrice = userRole === 'admin' ? job.client_price : job.pay_rate;

  const handleBackupWithPhone = () => {
    if (backupPhone.trim()) {
      onUpdateBackup(job, backupPhone);
      setShowPhoneInput(false);
    }
  };



  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="group overflow-hidden border-2 border-[#B8956A]/20 hover:border-[#B8956A] hover:shadow-xl transition-all duration-300 bg-white">
        <div className="h-1 bg-gradient-to-r from-[#B8956A] via-[#C4A15C] to-[#B8956A]" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-[#1A1A1A] truncate">{job.title}</h3>
              <div className="flex items-center gap-1.5 mt-1 text-[#1A1A1A]/50 text-sm">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{job.location}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold text-[#B8956A]">${displayPrice}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="outline" className={type.color}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {type.label}
            </Badge>
            <Badge variant="outline" className={status.color}>
              {status.label}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-[#1A1A1A]/60 mb-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(job.date), "MMM d, yyyy")}
            </div>
            {job.start_time && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {job.start_time}
              </div>
            )}
            {job.duration_hours && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {job.duration_hours}h
              </div>
            )}
          </div>

          {job.description && (
            <p className="text-sm text-[#1A1A1A]/60 line-clamp-2 mb-4">{job.description}</p>
          )}

          {job.package && (
            <div className="text-xs text-[#1A1A1A]/60 mb-2">
              <span className="font-medium">Package:</span> {job.package.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          )}

          {job.add_ons && job.add_ons.length > 0 && (
            <div className="text-xs text-[#1A1A1A]/60 mb-4">
              <span className="font-medium">Add-ons:</span> {job.add_ons.map(addon => addon.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())).join(', ')}
            </div>
          )}

          {job.booked_by_name && (
            <div className="text-xs text-[#1A1A1A]/40 mb-4">
              <p>
                Booked by <span className="font-medium text-[#B8956A]">{job.booked_by_name}</span>
              </p>
              {job.backup_booked_by_name && (
                <p className="mt-1">
                  Backup: <span className="font-medium text-[#B8956A]/70">{job.backup_booked_by_name}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {job.status === "open" ? (
              <Button
                onClick={() => onBook(job)}
                className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white text-sm font-medium"
              >
                Book This Gig
              </Button>
            ) : isBookedByMe ? (
              <Button
                onClick={() => onCancel(job)}
                variant="outline"
                className="w-full text-sm border-red-300 text-red-600 hover:bg-red-50"
              >
                Cancel My Booking
              </Button>
            ) : isBackupByMe ? (
              <Button variant="outline" disabled className="w-full text-sm">
                You're backup
              </Button>
            ) : job.backup_booked_by ? (
              <Button variant="outline" disabled className="w-full text-sm">
                Backup taken
              </Button>
            ) : (
              <div className="w-full">
                {showPhoneInput ? (
                  <div className="space-y-2">
                    <input
                      type="tel"
                      placeholder="Your phone number"
                      value={backupPhone}
                      onChange={(e) => setBackupPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-[#B8956A]/30 rounded-md text-sm focus:border-[#B8956A] outline-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleBackupWithPhone}
                        className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white text-xs"
                      >
                        Confirm
                      </Button>
                      <Button
                        onClick={() => setShowPhoneInput(false)}
                        variant="outline"
                        className="flex-1 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setShowPhoneInput(true)}
                    variant="outline"
                    className="w-full text-sm border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10"
                  >
                    Book as Backup
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}