import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Paperclip, X, Check, Image } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function LogActivityModal({ open, onClose, contact, salesMemberId, salesMemberEmail, onLogged }) {
  const [activityType, setActivityType] = useState("call");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("");
  const [activityDate, setActivityDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  });
  const [screenshots, setScreenshots] = useState([]); // { name, url }
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const fileInputRef = useRef(null);

  // Load contacts when modal opens
  React.useEffect(() => {
    if (!open) return;
    setLoadingContacts(true);
    const memberId = salesMemberId || localStorage.getItem('sales_member_id');
    base44.entities.ActivityLog.filter({ sales_member_id: memberId }, '-activity_date', 100)
      .then(logs => {
        const uniqueContacts = {};
        logs?.forEach(log => {
          const key = log.contact_email || log.contact_name;
          if (key && !uniqueContacts[key]) {
            uniqueContacts[key] = {
              email: log.contact_email || "",
              name: log.contact_name,
              company: log.company_name
            };
          }
        });
        setContacts(Object.values(uniqueContacts).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        if (contact) {
          setSelectedContact(contact.email || contact.id);
        }
      })
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [open, salesMemberId, contact]);

  const selectedContactObj = selectedContact 
    ? contacts.find(c => c.email === selectedContact) || contact
    : contact;

  const contactName = selectedContactObj
    ? [selectedContactObj.firstname, selectedContactObj.lastname].filter(Boolean).join(" ") || selectedContactObj.name || ""
    : "";

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setScreenshots(prev => [...prev, { name: file.name, url: file_url }]);
      }
    } catch (err) {
      toast.error("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!selectedContact) {
      toast.error("Please select a contact.");
      return;
    }
    if (!notes.trim()) {
      toast.error("Please add some notes before saving.");
      return;
    }
    setSaving(true);
    try {
      const screenshotLinks = screenshots.map(s => s.url).join("\n");
      const fullNotes = screenshotLinks
        ? `${notes.trim()}\n\n[Screenshots]\n${screenshotLinks}`
        : notes.trim();

      await base44.entities.ActivityLog.create({
        activity_type: activityType,
        contact_email: selectedContactObj?.email || "",
        contact_name: contactName,
        contact_phone: selectedContactObj?.phone || contact?.phone || "",
        company_name: selectedContactObj?.company || "",
        activity_date: new Date(activityDate).toISOString(),
        notes: notes.trim(),
        duration_minutes: duration ? Number(duration) : 0,
        picture_urls: screenshots.map(s => s.url),
        sales_member_id: salesMemberId || "",
        sales_member_email: salesMemberEmail || localStorage.getItem("sales_member_email") || "",
        hubspot_synced: false,
      });

      toast.success("Activity logged successfully.");
      if (onLogged) onLogged();
      handleClose();
    } catch (err) {
      toast.error("Failed to log activity: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setActivityType("call");
    setNotes("");
    setDuration("");
    setScreenshots([]);
    setActivityDate(new Date().toISOString().slice(0, 16));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Activity{contactName ? ` — ${contactName}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
           {/* Contact */}
           <div className="space-y-1">
             <Label>Contact</Label>
             <Select value={selectedContact || ""} onValueChange={setSelectedContact} disabled={loadingContacts}>
               <SelectTrigger>
                 <SelectValue placeholder={loadingContacts ? "Loading contacts..." : "Select or create contact"} />
               </SelectTrigger>
               <SelectContent>
                 {contacts.length === 0 && !loadingContacts && (
                   <SelectItem value="__none__" disabled>No previous contacts found</SelectItem>
                 )}
                 {contacts.map((c) => (
                   <SelectItem key={c.email} value={c.email}>
                     {c.name} {c.company ? `(${c.company})` : ""}
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
           </div>

           {/* Type */}
           <div className="space-y-1">
             <Label>Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">📞 Call</SelectItem>
                <SelectItem value="email">✉️ Email</SelectItem>
                <SelectItem value="meeting">🤝 Meeting</SelectItem>
                <SelectItem value="task">✓ Task</SelectItem>
                <SelectItem value="note">📝 Note</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date/time */}
          <div className="space-y-1">
            <Label>Date & Time</Label>
            <Input
              type="datetime-local"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
            />
          </div>

          {/* Duration (calls/meetings) */}
          {activityType !== "email" && (
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes / Summary</Label>
            <Textarea
              placeholder="What was discussed, decided, or sent..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-28 resize-none"
            />
          </div>

          {/* Screenshots */}
          <div className="space-y-2">
            <Label>Screenshots / Attachments</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              {uploading ? "Uploading..." : "Attach Files"}
            </Button>

            {screenshots.length > 0 && (
              <div className="space-y-1.5">
                {screenshots.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                    <Image className="w-3.5 h-3.5 text-[#B8956A] shrink-0" />
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-[#B8956A] hover:underline">
                      {s.name}
                    </a>
                    <button onClick={() => setScreenshots(prev => prev.filter((_, idx) => idx !== i))}>
                      <X className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={handleClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex-1 gap-2"
              style={{ backgroundColor: '#B8956A', color: '#fff' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Activity
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}