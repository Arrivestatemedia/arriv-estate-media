import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";

export default function SendMediaToClient() {
  const [selectedJobId, setSelectedJobId] = useState("");
  const [driveLink, setDriveLink] = useState("");
  const [youtubeLink, setYoutubeLink] = useState("");
  const [editableMessage, setEditableMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const { data: jobs = [] } = useQuery({
    queryKey: ["completedJobs"],
    queryFn: () => base44.entities.Job.filter({ from_booking: true }, "-date"),
  });

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  // Build default message whenever inputs change
  const buildDefaultMessage = () => {
    if (!selectedJob || !driveLink) return "";
    const hour = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" });
    const h = parseInt(hour);
    const timeOfDay = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    const firstName = selectedJob.client_name?.split(" ")[0] || selectedJob.client_name;
    const youtubeLine = youtubeLink
      ? `\n\nAnd here's the unbranded YouTube link for MLS:\n\n${youtubeLink}\n\nInstructions on how to drop your link directly into your listing:\n\nhttps://drive.google.com/file/d/1D1Pd9zqBa28MpBd3a8qxDWsvdYSE0smi/view?usp=sharing`
      : "";
    return `Good ${timeOfDay} ${firstName} -\nyour media for ${selectedJob.location} is ready.\n\nHere's the download link:\n\n${driveLink}${youtubeLine}\n\nHappy to make any adjustments if needed.\n-Brad`;
  };

  // Auto-populate the editable message when key inputs change
  useEffect(() => {
    setEditableMessage(buildDefaultMessage());
  }, [selectedJobId, driveLink, youtubeLink]);

  const handleSend = async () => {
    if (!selectedJobId || !driveLink || !editableMessage.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("sendMediaToClient", {
        jobId: selectedJobId,
        driveLink,
        youtubeLink: youtubeLink || undefined,
        messageBody: editableMessage,
      });
      setResult({ success: true, data: res.data });
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-[#1A1A1A] mb-2">Send Media to Client</h1>
        <p className="text-[#1A1A1A]/60 mb-8">Send the completed media links via email and SMS to the client.</p>

        <Card className="border-2 border-[#B8956A]/20 bg-white mb-6">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A] text-lg">Select Job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Job / Listing</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.location} — {job.client_name} ({job.date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedJob && (
              <div className="text-sm text-[#1A1A1A]/60 bg-[#FFFBF5] rounded-lg p-3 border border-[#B8956A]/20">
                <p><span className="font-medium">Client:</span> {selectedJob.client_name}</p>
                <p><span className="font-medium">Email:</span> {selectedJob.client_email}</p>
                <p><span className="font-medium">Phone:</span> {selectedJob.client_phone}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Google Drive Link <span className="text-red-500">*</span></Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Unbranded YouTube Link for MLS <span className="text-[#1A1A1A]/40 text-xs">(optional)</span></Label>
              <Input
                placeholder="https://youtu.be/..."
                value={youtubeLink}
                onChange={(e) => setYoutubeLink(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {editableMessage ? (
          <Card className="border-2 border-[#B8956A]/20 bg-white mb-6">
            <CardHeader>
              <CardTitle className="text-[#1A1A1A] text-lg">Edit Message</CardTitle>
              <p className="text-sm text-[#1A1A1A]/50">This message will be sent via both SMS and email. Edit as needed.</p>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editableMessage}
                onChange={(e) => setEditableMessage(e.target.value)}
                rows={10}
                className="font-mono text-sm leading-relaxed border-[#B8956A]/30 focus:border-[#B8956A]"
              />
              <button
                type="button"
                onClick={() => setEditableMessage(buildDefaultMessage())}
                className="mt-2 text-xs text-[#B8956A] hover:underline"
              >
                Reset to default
              </button>
            </CardContent>
          </Card>
        ) : null}

        {result && (
          <div className={`flex items-center gap-2 p-4 rounded-lg mb-6 text-sm font-medium ${result.success ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {result.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {result.success
              ? `Sent! Email: ${result.data?.emailOk ? "✓" : "✗"}  SMS: ${result.data?.smsOk ? "✓" : "✗"}`
              : `Error: ${result.error}`}
          </div>
        )}

        <Button
          onClick={handleSend}
          disabled={!selectedJobId || !driveLink || sending}
          className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white h-12 text-base"
        >
          <Send className="w-5 h-5 mr-2" />
          {sending ? "Sending..." : "Send to Client"}
        </Button>
      </div>
    </div>
  );
}