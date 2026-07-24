import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Clock, DollarSign, Camera, Video, Film, ShieldCheck } from "lucide-react";
import { format, parse as parseDate } from "date-fns";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import JobCompletionDialog from "./JobCompletionDialog";
import FootageUploadConfirmDialog from "./FootageUploadConfirmDialog";
import AttireVerificationDialog from "./AttireVerificationDialog";

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

export default function JobCard({ job, isAdmin, onBook, onManage, onCancel, onBookBackup, currentUserEmail, onUpdateBackup, userRole, isMediaPartner, onJobUpdate, backgroundCheckStatus, onCompleteBackgroundCheck }) {
  const type = typeConfig[job.type] || typeConfig.photo;
  const status = statusConfig[job.status] || statusConfig.open;
  const TypeIcon = type.icon;
  const isBookedByMe = job.booked_by === currentUserEmail;
  const isBackupByMe = job.backup_booked_by === currentUserEmail;
  const [showPhoneInput, setShowPhoneInput] = React.useState(false);
  const [backupPhone, setBackupPhone] = React.useState(job.backup_booked_by_phone || '');
  const [loading, setLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(Date.now());
  const [showCompletionDialog, setShowCompletionDialog] = React.useState(false);
  const [showFootageConfirmDialog, setShowFootageConfirmDialog] = React.useState(false);
  const [showAttireDialog, setShowAttireDialog] = React.useState(false);
  
  // Show client pricing to admins, contractor pricing to media partners
  const displayPrice = userRole === 'admin' ? job.client_price : job.pay_rate;

  // Update time every minute to check if start time is reached
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Check if we're 1 hour before start time or past it
  const isOneHourBefore = React.useMemo(() => {
    if (!job.date || !job.start_time) return false;
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    
    // Parse time - handle both 12-hour (9:30 PM) and 24-hour (21:30) formats
    let hour, minute;
    if (job.start_time.includes('AM') || job.start_time.includes('PM')) {
      const isPM = job.start_time.includes('PM');
      const timeStr = job.start_time.replace(/\s?(AM|PM)/gi, '').trim();
      const [h, m] = timeStr.split(':').map(Number);
      hour = isPM && h !== 12 ? h + 12 : (!isPM && h === 12 ? 0 : h);
      minute = m || 0;
    } else {
      [hour, minute] = job.start_time.split(':').map(Number);
    }
    
    jobDate.setHours(hour, minute, 0, 0);
    const jobDateTime = jobDate.getTime();
    const oneHourBefore = jobDateTime - (60 * 60 * 1000);
    return currentTime >= oneHourBefore;
  }, [job.date, job.start_time, currentTime]);

  const handleBackupWithPhone = () => {
    if (backupPhone.trim()) {
      onUpdateBackup(job, backupPhone);
      setShowPhoneInput(false);
    }
  };

  const handleOnMyWay = () => {
    setShowAttireDialog(true);
  };

  const handleAttireVerified = async () => {
    setLoading(true);
    try {
      await base44.entities.Job.update(job.id, { 
        media_partner_status: 'on_the_way',
        on_the_way_at: new Date().toISOString()
      });
      await base44.functions.invoke('sendSupraAccessNotification', { jobId: job.id });
      await base44.functions.invoke('notifyMediaPartnerAttireVerified', { jobId: job.id });
      setShowAttireDialog(false);
      if (onJobUpdate) onJobUpdate();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to send notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMediaPartnerOnSite = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('notifyClientMediaPartnerOnSite', { jobId: job.id });
      if (onJobUpdate) onJobUpdate();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to notify client');
    } finally {
      setLoading(false);
    }
  };

  const handleJobCompleted = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('notifyClientJobCompleted', { jobId: job.id });
      setLoading(false);
      setShowCompletionDialog(true);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to send notification');
      setLoading(false);
    }
  };

  const handleCloseCompletionDialog = async () => {
    setShowCompletionDialog(false);
    setLoading(true);
    try {
      await base44.entities.Job.update(job.id, { media_partner_status: 'job_completed' });
      if (onJobUpdate) onJobUpdate();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to update job status');
    } finally {
      setLoading(false);
    }
  };

  const handleFootageUploaded = async () => {
    setLoading(true);
    try {
      await base44.entities.Job.update(job.id, { 
        footage_uploaded: true,
        status: 'completed'
      });
      setShowFootageConfirmDialog(false);
      if (onJobUpdate) onJobUpdate();
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to confirm footage upload');
    } finally {
      setLoading(false);
    }
  };



  return (
    <>
      <JobCompletionDialog
        open={showCompletionDialog}
        onOpenChange={handleCloseCompletionDialog}
        googleDriveFolderUrl={job.google_drive_folder_url}
      />
      <FootageUploadConfirmDialog
        open={showFootageConfirmDialog}
        onOpenChange={setShowFootageConfirmDialog}
        googleDriveFolderUrl={job.google_drive_folder_url}
        onConfirm={handleFootageUploaded}
      />
      <AttireVerificationDialog
        open={showAttireDialog}
        onOpenChange={setShowAttireDialog}
        jobId={job.id}
        onVerified={handleAttireVerified}
      />
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
              {(() => {
                const date = new Date(job.date);
                date.setDate(date.getDate() + 1);
                return format(date, "MMM d, yyyy");
              })()}
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

          {job.booked_by_name && !isMediaPartner && (
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
            ) : isBookedByMe && backgroundCheckStatus && backgroundCheckStatus !== "clear" ? (
              <Button
                onClick={() => onCompleteBackgroundCheck && onCompleteBackgroundCheck(job)}
                className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white text-sm font-medium"
              >
                <ShieldCheck className="w-4 h-4 mr-2" />
                Complete Background Check
              </Button>
            ) : isBookedByMe && job.media_partner_status === 'job_completed' && !job.footage_uploaded ? (
              <Button
                onClick={() => setShowFootageConfirmDialog(true)}
                disabled={loading}
                className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white text-sm font-medium"
              >
                {loading ? 'Processing...' : "I've uploaded my footage"}
              </Button>
            ) : isBookedByMe && job.media_partner_status === 'job_completed' && job.footage_uploaded ? (
              <Button
                variant="outline"
                disabled
                className="w-full text-sm"
              >
                Footage Uploaded ✓
              </Button>
            ) : isBookedByMe && job.media_partner_status === 'on_site' ? (
              <Button
                onClick={handleJobCompleted}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
              >
                {loading ? 'Processing...' : "I've Completed the Job"}
              </Button>
            ) : isBookedByMe && job.media_partner_status === 'on_the_way' ? (
              <Button
                onClick={handleMediaPartnerOnSite}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                {loading ? 'Processing...' : "I'm Here"}
              </Button>
            ) : isBookedByMe && job.media_partner_status === 'awaiting_arrival' && isOneHourBefore ? (
              <Button
                onClick={handleOnMyWay}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
              >
                {loading ? 'Processing...' : "I'm On My Way"}
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
    </>
  );
}