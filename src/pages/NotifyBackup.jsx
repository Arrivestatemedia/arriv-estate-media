import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

export default function NotifyBackup() {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [sending, setSending] = useState(false);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["allJobs"],
    queryFn: () => base44.entities.Job.list("-created_date"),
  });

  const handleSend = async () => {
    if (!selectedJobId || !phoneNumber) {
      toast.error("Please select a job and enter a phone number");
      return;
    }

    setSending(true);
    try {
      await base44.functions.invoke('notifyBackupContractor', {
        jobId: selectedJobId,
        phoneNumber: phoneNumber
      });
      
      toast.success("Notification sent successfully!");
      setPhoneNumber("");
      setSelectedJobId("");
    } catch (error) {
      toast.error("Failed to send notification: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const selectedJob = jobs.find(j => j.id === selectedJobId);

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1A1A1A]">Notify Backup Contractor</h1>
          <p className="text-[#1A1A1A]/60 mt-1">Send job assignment notification to backup contractor</p>
        </div>

        <Card className="border-2 border-[#B8956A]/20 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#1A1A1A]">
              <MessageCircle className="w-5 h-5 text-[#B8956A]" />
              Send Job Notification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium text-[#1A1A1A] block mb-2">
                Select Job
              </label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="border-[#B8956A]/30 focus:border-[#B8956A]">
                  <SelectValue placeholder="Choose a job..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoading ? (
                    <SelectItem value="loading" disabled>Loading jobs...</SelectItem>
                  ) : jobs.length === 0 ? (
                    <SelectItem value="none" disabled>No jobs available</SelectItem>
                  ) : (
                    jobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title} - {job.location} ({job.date})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedJob && (
              <div className="bg-[#FFFBF5] border border-[#B8956A]/20 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-[#1A1A1A]">Job Details</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[#1A1A1A]/60">Title:</span>
                    <p className="text-[#1A1A1A] font-medium">{selectedJob.title}</p>
                  </div>
                  <div>
                    <span className="text-[#1A1A1A]/60">Location:</span>
                    <p className="text-[#1A1A1A] font-medium">{selectedJob.location}</p>
                  </div>
                  <div>
                    <span className="text-[#1A1A1A]/60">Date:</span>
                    <p className="text-[#1A1A1A] font-medium">{selectedJob.date}</p>
                  </div>
                  <div>
                    <span className="text-[#1A1A1A]/60">Time:</span>
                    <p className="text-[#1A1A1A] font-medium">{selectedJob.start_time}</p>
                  </div>
                  <div>
                    <span className="text-[#1A1A1A]/60">Pay:</span>
                    <p className="text-[#B8956A] font-bold">${selectedJob.pay_rate}</p>
                  </div>
                  <div>
                    <span className="text-[#1A1A1A]/60">Status:</span>
                    <p className="text-[#1A1A1A] font-medium">{selectedJob.status}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-[#1A1A1A] block mb-2">
                Contractor Phone Number
              </label>
              <Input
                type="tel"
                placeholder="4041234567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="border-[#B8956A]/30 focus:border-[#B8956A]"
              />
              <p className="text-xs text-[#1A1A1A]/60 mt-1">
                Enter phone number without spaces or dashes
              </p>
            </div>

            <Button
              onClick={handleSend}
              disabled={!selectedJobId || !phoneNumber || sending}
              className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Sending..." : "Send Notification"}
            </Button>

            {selectedJob && phoneNumber && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-medium text-blue-900 mb-1">Preview Message:</p>
                <p className="text-sm text-blue-800">
                  "Congratulations! You've been assigned to: {selectedJob.title} at {selectedJob.location} on {selectedJob.date} at {selectedJob.start_time}. Pay: ${selectedJob.pay_rate}. - Arriv"
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}