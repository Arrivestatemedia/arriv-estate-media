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
    setSelectedContact(null);
    setLoadingContacts(true);
    const memberId = salesMemberId || localStorage.getItem('sales_member_id');
    const memberEmail = salesMemberEmail || localStorage.getItem('sales_member_email');
    const normalizedEmail = (memberEmail || '').toLowerCase().trim();
    const normalizedId = (memberId || '').trim();
    base44.entities.ActivityLog.list('-activity_date', 500)
      .then(all => {
        const logs = all.filter(a =>
          (a.sales_member_id || '').trim() === normalizedId ||
          (a.sales_member_email || '').toLowerCase().trim() === normalizedEmail ||
          (a.created_by || '').toLowerCase().trim() === normalizedEmail
        );
        const isPhoneOrExtension = (name) => !name || /^[+\d\s\-().]+$/.test(name.trim()) || /^\d{1,4}$/.test(name.trim());
        const uniqueContacts = {};
        logs.forEach(log => {
          if (isPhoneOrExtension(log.contact_name) && !log.contact_email) return;
          const key = log.contact_email || log.contact_name;
          if (key && !uniqueContacts[key]) {
            uniqueContacts[key] = {
              email: log.contact_email || "",
              name: log.contact_name,
              company: log.company_name
            };
          }
        });

        // Always ensure the passed contact is in the list
        if (contact) {
          const contactFullName = [contact.firstname, contact.lastname].filter(Boolean).join(' ') || contact.name || '';
          const contactEmail = contact.email || '';
          const key = contactEmail || contactFullName;
          if (key && !uniqueContacts[key]) {
            uniqueContacts[key] = {
              email: contactEmail,
              name: contactFullName || contact.contact_name || '',
              company: contact.company || contact.company_name || ''
            };
          }
          // Auto-select it
          const selectValue = contactEmail || contactFullName;
          if (selectValue) setSelectedContact(selectValue);
        }

        setContacts(Object.values(uniqueContacts).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      })
      .catch(() => setContacts([]))
      .finally(() => setLoadingContacts(false));
  }, [open, salesMemberId, contact]);

  const selectedContactObj = selectedContact
    ? contacts.find(c => (c.email && c.email === selectedContact) || (c.name && c.name === selectedContact)) || contact
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
      const sid = salesMemberId || localStorage.getItem('sales_member_id');
      const sem = salesMemberEmail || localStorage.getItem('sales_member_email');
      const contactEmail = selectedContactObj?.email || "";
      const contactNameStr = contactName;

      // 1. Save the new activity
      await base44.entities.ActivityLog.create({
        activity_type: activityType,
        contact_email: contactEmail,
        contact_name: contactNameStr,
        contact_phone: selectedContactObj?.phone || contact?.phone || "",
        company_name: selectedContactObj?.company || "",
        activity_date: new Date(activityDate).toISOString(),
        notes: notes.trim(),
        duration_minutes: duration ? Number(duration) : 0,
        picture_urls: screenshots.map(s => s.url),
        sales_member_id: sid || "",
        sales_member_email: sem || "",
        hubspot_synced: false,
      });

      // 2. Find existing AI-scheduled record for this contact and move it to history
      const allLogs = await base44.entities.ActivityLog.list('-activity_date', 500);
      const contactLogs = allLogs.filter(a =>
        (contactEmail && a.contact_email === contactEmail) ||
        (contactNameStr && a.contact_name === contactNameStr)
      ).filter(a =>
        a.sales_member_id === sid ||
        (a.sales_member_email || '').toLowerCase() === (sem || '').toLowerCase() ||
        (a.created_by || '').toLowerCase() === (sem || '').toLowerCase()
      );

      const existingScheduled = contactLogs.find(a => {
        const n = a.notes || '';
        return n.includes('[AI Scheduled]') || (n.includes('--- CALL MAP ---') && !n.includes('[Queue Call]'));
      });

      if (existingScheduled) {
        await base44.entities.ActivityLog.update(existingScheduled.id, {
          activity_date: new Date().toISOString(),
          notes: `[Queue Call] Outcome from activity log — ${notes.trim()}`,
        }).catch(() => {});
      }

      // 3. Use AI to schedule the next follow-up
      const historySnippet = contactLogs
        .filter(a => !(a.notes || '').includes('[AI Scheduled]'))
        .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
        .slice(0, 6)
        .map(a => `${new Date(a.activity_date).toLocaleDateString()}: [${a.activity_type}] ${(a.notes || '').slice(0, 150)}`)
        .join('\n');

      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: `You are scheduling the next sales follow-up call for a real estate photography company (ARRIV).

Contact: ${contactNameStr} ${selectedContactObj?.company ? `at ${selectedContactObj.company}` : ''}
Activity just logged (${activityType}): ${notes.trim()}

Recent history:
${historySnippet || "No prior history"}

Based on the activity notes and history, determine when to next contact this person.
Use one of these outcome patterns to guide timing:
- No answer → follow up in 3 hours
- Busy / bad time → call back next morning at 8:30am
- Interested → follow up in 1-2 days
- Warm, will reach out when ready → follow up in 3 weeks
- Not interested → pause 30 days
- Left voicemail → follow up in 3 days at 5pm
- General note/meeting → use best judgment (typically 5-7 days)

Output JSON with follow_up_date_time (ISO), urgency (high/medium/low/skip), and reason.`,
        response_json_schema: {
          type: "object",
          properties: {
            follow_up_date_time: { type: "string" },
            urgency: { type: "string", enum: ["high", "medium", "low", "skip"] },
            reason: { type: "string" }
          },
          required: ["follow_up_date_time", "urgency", "reason"]
        }
      });

      if (analysis && analysis.urgency !== "skip") {
        let followUpDate = new Date(analysis.follow_up_date_time || Date.now() + 7 * 24 * 60 * 60 * 1000);
        // Hard minimum: 7 days out unless notes explicitly say same-day or next-day
        const reasonLower = (analysis.reason || "").toLowerCase();
        const explicitShort = reasonLower.includes("later today") || reasonLower.includes("call back today") ||
          reasonLower.includes("tomorrow morning") || reasonLower.includes("call tomorrow") || reasonLower.includes("callback tomorrow");
        const minDate = explicitShort ? new Date() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (followUpDate < minDate) { followUpDate = minDate; followUpDate.setHours(8, 30, 0, 0); }
        await base44.entities.ActivityLog.create({
          activity_type: "call",
          contact_name: contactNameStr,
          contact_email: contactEmail,
          contact_phone: selectedContactObj?.phone || contact?.phone || "",
          company_name: selectedContactObj?.company || "",
          activity_date: followUpDate.toISOString(),
          notes: `[AI Scheduled] ${analysis.reason}`,
          sales_member_id: sid || "",
          sales_member_email: sem || "",
        });
      }

      toast.success("Activity logged & next follow-up scheduled.");
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
    setSelectedContact(null);
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
                   <SelectItem key={c.email || c.name} value={c.email || c.name}>
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