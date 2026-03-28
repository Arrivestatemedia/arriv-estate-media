import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

export default function SendMediaDialog({ job, open, onClose }) {
  const [driveLink, setDriveLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!driveLink.trim()) {
      toast({ title: "Google Drive link is required", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await base44.functions.invoke("sendMediaToClient", {
        jobId: job.id,
        driveLink: driveLink.trim(),
        youtubeLink: youtubeLink.trim() || null,
      });
      toast({ title: "Media sent!", description: `Email and SMS sent to ${job.client_name}.` });
      setDriveLink("");
      setYoutubeLink("");
      onClose();
    } catch (err) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Media to Client</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-gray-500 mb-2">
          Sending to <strong>{job.client_name}</strong> ({job.client_email || "no email"} / {job.client_phone || "no phone"})
        </div>
        <div className="space-y-4">
          <div>
            <Label>Google Drive Link <span className="text-red-500">*</span></Label>
            <Input
              placeholder="https://drive.google.com/..."
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Unbranded YouTube Link <span className="text-gray-400">(optional, for MLS)</span></Label>
            <Input
              placeholder="https://youtube.com/..."
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600 whitespace-pre-line">
            {`Good [time of day] ${job.client_name?.split(' ')[0] || 'Client'} -\nyour media for ${job.location || 'your property'} is ready.\n\nHere's the download link:\n[Drive Link]${youtubeLink ? '\n\nAnd here\'s the unbranded YouTube link for MLS:\n[YouTube Link]' : ''}\n\nHappy to make any adjustments if needed.\n-Brad`}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}