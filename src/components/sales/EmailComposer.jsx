import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useSalesDashboardData } from "@/hooks/useSalesDashboardData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, Loader2, Inbox, PenLine, ChevronDown, ChevronUp, Clock, Trash2, Calendar, SendHorizontal, Mail } from "lucide-react";
import AiAssistButton from "./AiAssistButton";
import GmailLikeInbox from "./GmailLikeInbox";
import { format } from "date-fns";

export default function EmailComposer({ salesMemberId, isAdmin = false }) {
  const [tab, setTab] = useState("compose");
  const [salesMember, setSalesMember] = useState(null);
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduleMeetingMode, setScheduleMeetingMode] = useState(false);
  const [meetingData, setMeetingData] = useState({ title: "", startTime: "", endTime: "", description: "" });
  const [invitingClients, setInvitingClients] = useState(false);
  const [meetingAttendees, setMeetingAttendees] = useState([]);
  const [extraAttendeeEmail, setExtraAttendeeEmail] = useState("");
  const [ccRecipients, setCcRecipients] = useState([]);
  const [ccInput, setCcInput] = useState("");
  const [bccRecipients, setBccRecipients] = useState([]);
  const [bccInput, setBccInput] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [fromEmail, setFromEmail] = useState("");
  const [formData, setFormData] = useState({ to: "", subject: "", body: "" });

  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const [sentEmails, setSentEmails] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);

  const [selectedEmail, setSelectedEmail] = useState(null);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);

  const lastInboxCountRef = React.useRef(null);

  // Fetch profile via backend function (bypasses RLS for sales-authenticated users)
  const { data: dashboardData } = useSalesDashboardData(isAdmin ? null : salesMemberId);

  useEffect(() => {
    if (isAdmin) {
      base44.auth.me().then(adminUser => {
        if (adminUser?.email) {
          base44.functions.invoke('getSalesDashboardData', { sales_member_id: salesMemberId }).then(res => {
            const data = res?.data || res;
            if (data?.profile) {
              setSalesMember(data.profile);
              if (data.profile.company_email) setFromEmail(data.profile.company_email);
            } else {
              setSalesMember(adminUser);
            }
          }).catch(() => setSalesMember(adminUser));
        } else {
          setSalesMember(adminUser);
        }
      }).catch(() => {});
    } else if (dashboardData?.profile) {
      setSalesMember(dashboardData.profile);
      if (dashboardData.profile.company_email) setFromEmail(dashboardData.profile.company_email);
    }
  }, [salesMemberId, isAdmin, dashboardData?.profile]);

  useEffect(() => {
    if (tab === "replies" && salesMember) loadReplies();
    if (tab === "scheduled") loadScheduledEmails();
    if (tab === "outbox") loadSentEmails();
  }, [tab, salesMember]);

  // ⚠️ DO NOT REMOVE — reads '_emailTo' from localStorage set by HubSpotActivityLog
  // when a contact card email is clicked. Pre-fills the To field on the Compose tab.
  useEffect(() => {
    const emailTo = localStorage.getItem('_emailTo');
    if (emailTo) {
      setFormData(f => ({ ...f, to: emailTo }));
      setTab("compose");
      localStorage.removeItem('_emailTo');
    } else if (window._openEmailComposerWithEmail) {
      setFormData(f => ({ ...f, to: window._openEmailComposerWithEmail }));
      setTab("compose");
      window._openEmailComposerWithEmail = null;
    }
  }, []);

  useEffect(() => {
    if (!salesMemberId) return;
    const emailToUse = fromEmail || salesMember?.company_email || salesMember?.email;
    if (!emailToUse) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const checkInbox = async () => {
      try {
        const res = await base44.functions.invoke('canonicalCommunicationService', { action: 'thread_list', salesMemberId, contactEmails: [], toEmail: emailToUse });
        const threads = res.data?.threads || [];
        if (lastInboxCountRef.current !== null && threads.length > lastInboxCountRef.current) {
          const newCount = threads.length - lastInboxCountRef.current;
          try {
            const ctx = window._unlockedAudioCtx;
            if (ctx && ctx.state !== 'suspended') {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain); gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(660, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
            }
          } catch (e) {}
          if (Notification.permission === "granted") {
            new Notification(`📧 ${newCount} new email${newCount > 1 ? 's' : ''} in your inbox`, { body: threads[0]?.snippet || "", tag: "email-inbox" });
          }
        }
        lastInboxCountRef.current = threads.length;
      } catch (e) {
        // Silently ignore polling errors - don't crash the component
      }
    };
    const interval = setInterval(checkInbox, 60000);
    return () => clearInterval(interval);
  }, [salesMemberId, fromEmail, salesMember?.company_email, salesMember?.email]);

  const loadScheduledEmails = async () => {
    setLoadingScheduled(true);
    try {
      const emails = await base44.entities.ScheduledEmail.filter({ sales_member_id: salesMemberId });
      setScheduledEmails(emails.sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const handleDeleteScheduled = async (id) => {
    await base44.entities.ScheduledEmail.delete(id);
    setScheduledEmails(prev => prev.filter(e => e.id !== id));
  };

  const loadReplies = async () => {
    setLoadingReplies(true);
    try {
      const emailToUse = fromEmail || salesMember?.company_email || salesMember?.email;
      const res = await base44.functions.invoke('canonicalCommunicationService', { action: 'thread_list', salesMemberId, contactEmails: [], toEmail: emailToUse });
      setReplies(res.data?.threads || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReplies(false);
    }
  };

  const loadSentEmails = async () => {
    setLoadingSent(true);
    try {
      const emailToFilter = fromEmail || salesMember?.company_email || salesMember?.email;
      const emails = await base44.entities.MessageLog.filter({ 
        message_type: "email", 
        sales_member_email: emailToFilter
      });
      setSentEmails(emails.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSent(false);
    }
  };

  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setLoading(true);
    try {
      const result = await base44.functions.invoke('searchHubSpotContacts', { query });
      setSearchResults(result.data?.contacts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setFormData(f => ({ ...f, to: contact.email }));
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSendEmail = async () => {
    if (!formData.to || !formData.subject || !formData.body) {
      alert("Please fill in all fields");
      return;
    }
    if (scheduleMode && scheduledFor) {
      try {
        const emailToUse = fromEmail || salesMember?.company_email || salesMember?.email;
        await base44.entities.ScheduledEmail.create({
           sales_member_id: salesMemberId,
           sales_member_email: emailToUse,
           to: formData.to,
           subject: formData.subject,
           body: formData.body,
           from_email: emailToUse || undefined,
           from_name: salesMember?.full_name || undefined,
           scheduled_for: new Date(scheduledFor).toISOString(),
           status: "pending"
         });
        setSent(true);
        setFormData({ to: "", subject: "", body: "" });
        setSelectedContact(null);
        setScheduleMode(false);
        setScheduledFor("");
        setTimeout(() => setSent(false), 3000);
      } catch (err) {
        alert("Failed to schedule: " + err.message);
      }
      return;
    }
    setSending(true);
    try {
      const emailToUse = fromEmail || salesMember?.company_email || salesMember?.email;
      await base44.functions.invoke('sendHubEmail', {
        ...formData,
        cc: ccRecipients.join(", ") || undefined,
        bcc: bccRecipients.join(", ") || undefined,
        contactEmail: selectedContact?.email,
        fromEmail: emailToUse || undefined,
        fromName: salesMember?.full_name || undefined,
        salesMemberId: salesMemberId || undefined,
        contactName: selectedContact ? `${selectedContact.firstname || ''} ${selectedContact.lastname || ''}`.trim() : undefined,
      });
      setSent(true);
      setFormData({ to: "", subject: "", body: "" });
      setSelectedContact(null);
      setCcRecipients([]);
      setCcInput("");
      setBccRecipients([]);
      setBccInput("");
      setTimeout(() => setSent(false), 3000);
    } catch (error) {
      alert("Failed to send email: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleScheduleMeeting = async () => {
    if (!meetingData.title || !meetingData.startTime || !meetingData.endTime) {
      alert("Please fill in title, start, and end times");
      return;
    }
    if (!selectedContact) {
      alert("Please select a contact to invite");
      return;
    }
    setInvitingClients(true);
    try {
      const allEmails = [selectedContact.email, ...meetingAttendees];
      await base44.functions.invoke('scheduleGoogleCalendarInvite', {
        title: meetingData.title,
        description: meetingData.description || '',
        startTime: new Date(meetingData.startTime).toISOString(),
        endTime: new Date(meetingData.endTime).toISOString(),
        clientEmails: allEmails,
        salesRepCompanyEmail: salesMember?.company_email
      });
      alert(`Meeting scheduled! Invite sent to ${allEmails.length} attendee${allEmails.length > 1 ? 's' : ''}`);
      setMeetingData({ title: "", startTime: "", endTime: "", description: "" });
      setMeetingAttendees([]);
      setExtraAttendeeEmail("");
      setSelectedContact(null);
      setScheduleMeetingMode(false);
    } catch (error) {
      alert("Failed to schedule meeting: " + error.message);
    } finally {
      setInvitingClients(false);
    }
  };



  const statusColor = { pending: '#B8956A', sent: '#22c55e', failed: '#ef4444' };
  const fromOptions = salesMember?.company_email ? [{ label: salesMember.company_email, value: salesMember.company_email }] : [];

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 border-b overflow-x-auto whitespace-nowrap" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        <button onClick={() => setTab("compose")} className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "compose" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "compose" ? '#B8956A' : 'transparent' }}>
          <PenLine className="w-4 h-4" /> Compose
        </button>
        <button onClick={() => setTab("replies")} className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "replies" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "replies" ? '#B8956A' : 'transparent' }}>
          <Inbox className="w-4 h-4" /> Inbox
        </button>
        <button onClick={() => setTab("scheduled")} className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "scheduled" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "scheduled" ? '#B8956A' : 'transparent' }}>
          <Clock className="w-4 h-4" /> Scheduled
        </button>
        <button onClick={() => setTab("outbox")} className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "outbox" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "outbox" ? '#B8956A' : 'transparent' }}>
          <SendHorizontal className="w-4 h-4" /> Outbox
        </button>
        <button onClick={() => setTab("drafts")} className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "drafts" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "drafts" ? '#B8956A' : 'transparent' }}>
          <PenLine className="w-4 h-4" /> Drafts
        </button>
      </div>

      {/* COMPOSE */}
      {tab === "compose" && (
        <div className="space-y-4">
          {fromEmail && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)', border: '1px solid rgba(184,149,106,0.2)' }}>
              <Mail className="w-4 h-4 shrink-0" style={{ color: '#B8956A' }} />
              <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Sending from: {fromEmail}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Search Contacts</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4" style={{ color: '#B8956A' }} />
              <Input placeholder="Search by name, email, or company..." value={searchQuery} onChange={handleSearch} className="pl-10" />
              {loading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin" style={{ color: '#B8956A' }} />}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                {searchResults.map(contact => (
                  <button key={contact.id} onClick={() => handleSelectContact(contact)} className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0 transition">
                    <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{contact.firstname} {contact.lastname}</p>
                    <p className="text-xs" style={{ color: 'rgba(26,26,26,0.6)' }}>{contact.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedContact && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(184,149,106,0.1)', borderLeft: '3px solid #B8956A' }}>
              <span className="font-medium">To:</span> {selectedContact.firstname} {selectedContact.lastname} — {selectedContact.email}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>To</label>
            <Input type="email" placeholder="recipient@example.com" value={formData.to} onChange={e => setFormData(f => ({ ...f, to: e.target.value }))} />
          </div>

          {/* CC */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>CC</label>
            <div className="flex gap-2">
              <Input type="email" placeholder="cc@example.com" value={ccInput} onChange={e => setCcInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && ccInput.trim()) { setCcRecipients(prev => [...prev, ccInput.trim()]); setCcInput(""); } }} className="text-sm flex-1" />
              <Button type="button" size="sm" variant="outline" onClick={() => { if (ccInput.trim()) { setCcRecipients(prev => [...prev, ccInput.trim()]); setCcInput(""); } }} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Add</Button>
            </div>
            {ccRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {ccRecipients.map((email, idx) => (
                  <span key={idx} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#1A1A1A' }}>
                    {email}<button onClick={() => setCcRecipients(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* BCC */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>BCC</label>
            <div className="flex gap-2">
              <Input type="email" placeholder="bcc@example.com" value={bccInput} onChange={e => setBccInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && bccInput.trim()) { setBccRecipients(prev => [...prev, bccInput.trim()]); setBccInput(""); } }} className="text-sm flex-1" />
              <Button type="button" size="sm" variant="outline" onClick={() => { if (bccInput.trim()) { setBccRecipients(prev => [...prev, bccInput.trim()]); setBccInput(""); } }} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Add</Button>
            </div>
            {bccRecipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {bccRecipients.map((email, idx) => (
                  <span key={idx} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#1A1A1A' }}>
                    {email}<button onClick={() => setBccRecipients(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Subject</label>
            <Input placeholder="Email subject..." value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: '#1A1A1A' }}>Message</label>
              <AiAssistButton
                mode="email"
                context={{
                  contactName: selectedContact ? `${selectedContact.firstname || ''} ${selectedContact.lastname || ''}`.trim() : formData.to,
                  contactCompany: selectedContact?.company,
                  subject: formData.subject,
                  existingBody: formData.body,
                  repName: salesMember?.full_name
                }}
                onInsert={(text) => setFormData(f => ({ ...f, body: text }))}
              />
            </div>
            <Textarea placeholder="Your message..." value={formData.body} onChange={e => setFormData(f => ({ ...f, body: e.target.value }))} rows={8} />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={scheduleMode} onChange={e => setScheduleMode(e.target.checked)} className="accent-[#B8956A] w-4 h-4" />
              <span className="text-sm font-medium" style={{ color: '#1A1A1A' }}>Schedule for later</span>
            </label>
          </div>

          {scheduleMode && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Send At</label>
              <Input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} min={new Date().toISOString().slice(0, 16)} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
           <Button onClick={handleSendEmail} disabled={sending || sent || (scheduleMode && !scheduledFor)} className="flex-1 min-w-[120px] gap-2" style={{ backgroundColor: sent ? '#22c55e' : '#B8956A', color: sent ? '#fff' : '#1A1A1A' }}>
             {scheduleMode ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
             {sending ? "Sending..." : sent ? (scheduleMode ? "Scheduled!" : "Sent!") : scheduleMode ? "Schedule Email" : "Send Email"}
           </Button>
           <Button 
             onClick={() => {
               const draft = { to: formData.to, subject: formData.subject, body: formData.body, id: Date.now().toString(), savedAt: new Date().toISOString() };
               setDrafts(prev => [...prev, draft]);
               setFormData({ to: "", subject: "", body: "" });
               setSelectedContact(null);
               alert("Draft saved!");
             }} 
             variant="outline" 
             className="gap-2 shrink-0" 
             style={{ borderColor: '#B8956A', color: '#B8956A' }}
           >
             <PenLine className="w-4 h-4" />
             Save Draft
           </Button>
           <Button onClick={() => setScheduleMeetingMode(!scheduleMeetingMode)} variant="outline" className="gap-2 shrink-0" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
             <Calendar className="w-4 h-4" />
             Schedule Meeting
           </Button>
          </div>

          {scheduleMeetingMode && !selectedContact && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(255,200,100,0.15)', borderLeft: '3px solid #B8956A', color: '#1A1A1A' }}>
              Please search and select a contact above before scheduling a meeting.
            </div>
          )}
          {scheduleMeetingMode && selectedContact && (
            <div className="p-4 rounded-lg border" style={{ borderColor: 'rgba(184,149,106,0.2)', backgroundColor: 'rgba(184,149,106,0.05)' }}>
              <p className="text-sm font-medium mb-3" style={{ color: '#1A1A1A' }}>Schedule Meeting with {selectedContact.firstname}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Meeting Title</label>
                  <Input placeholder="e.g., Project Consultation" value={meetingData.title} onChange={e => setMeetingData(prev => ({ ...prev, title: e.target.value }))} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Start Time</label>
                  <Input type="datetime-local" value={meetingData.startTime} onChange={e => setMeetingData(prev => ({ ...prev, startTime: e.target.value }))} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>End Time</label>
                  <Input type="datetime-local" value={meetingData.endTime} onChange={e => setMeetingData(prev => ({ ...prev, endTime: e.target.value }))} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Description (optional)</label>
                  <Textarea placeholder="Meeting details..." value={meetingData.description} onChange={e => setMeetingData(prev => ({ ...prev, description: e.target.value }))} rows={3} className="text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Add More Attendees</label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="attendee@email.com"
                      value={extraAttendeeEmail}
                      onChange={e => setExtraAttendeeEmail(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && extraAttendeeEmail.trim()) {
                          setMeetingAttendees(prev => [...prev, extraAttendeeEmail.trim()]);
                          setExtraAttendeeEmail("");
                        }
                      }}
                      className="text-sm flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (extraAttendeeEmail.trim()) {
                          setMeetingAttendees(prev => [...prev, extraAttendeeEmail.trim()]);
                          setExtraAttendeeEmail("");
                        }
                      }}
                      style={{ borderColor: '#B8956A', color: '#B8956A' }}
                    >
                      Add
                    </Button>
                  </div>
                  {meetingAttendees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {meetingAttendees.map((email, idx) => (
                        <span key={idx} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#1A1A1A' }}>
                          {email}
                          <button onClick={() => setMeetingAttendees(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-red-500">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleScheduleMeeting} disabled={invitingClients} className="flex-1" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                    {invitingClients ? "Sending..." : "Send Invite"}
                  </Button>
                  <Button onClick={() => { setScheduleMeetingMode(false); setMeetingAttendees([]); setExtraAttendeeEmail(""); }} variant="outline" className="flex-1" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCHEDULED */}
      {tab === "scheduled" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Emails scheduled to send automatically</p>
            <Button size="sm" variant="outline" onClick={loadScheduledEmails} disabled={loadingScheduled} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              {loadingScheduled ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
          {loadingScheduled ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
            </div>
          ) : scheduledEmails.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgba(26,26,26,0.4)' }}>
              <Clock className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>No scheduled emails yet</p>
            </div>
          ) : (
            scheduledEmails.map(email => (
              <div key={email.id} className="rounded-lg border p-4 flex items-start justify-between gap-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: statusColor[email.status] || '#888' }}>
                      {email.status}
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                      {email.scheduled_for ? format(new Date(email.scheduled_for), "MMM d, yyyy h:mm a") : ''}
                    </span>
                  </div>
                  <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>To: {email.to}</p>
                  <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{email.subject}</p>
                  {email.error_message && <p className="text-xs text-red-500 mt-1">{email.error_message}</p>}
                </div>
                {email.status === "pending" && (
                  <button onClick={() => handleDeleteScheduled(email.id)} className="text-gray-400 hover:text-red-500 transition shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* INBOX */}
      {tab === "replies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>All emails received in your inbox</p>
            <Button size="sm" variant="outline" onClick={loadReplies} disabled={loadingReplies} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              {loadingReplies ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {loadingReplies ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
            </div>
          ) : replies.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'rgba(26,26,26,0.4)' }}>
              <Inbox className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>No emails in your inbox yet</p>
            </div>
          ) : (
           replies.map(reply => (
             <button key={reply.id} onClick={() => { setSelectedEmail(reply); setEmailModalOpen(true); }} className="w-full text-left rounded-lg border p-4 hover:opacity-80 transition flex items-start justify-between gap-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
               <div className="flex-1 min-w-0">
                 <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{reply.from}</p>
                 <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{reply.subject || '(no subject)'}</p>
                 <p className="text-xs mt-1 truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>{reply.snippet}</p>
               </div>
               <div className="text-xs shrink-0" style={{ color: 'rgba(26,26,26,0.4)' }}>{reply.date ? format(new Date(reply.date), "MMM d") : ''}</div>
             </button>
           ))
          )}
          </div>
          )}

          {/* OUTBOX */}
          {tab === "outbox" && (
          <div className="space-y-3">
          <div className="flex items-center justify-between">
           <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>All emails you've sent through this system</p>
           <Button size="sm" variant="outline" onClick={loadSentEmails} disabled={loadingSent} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
             {loadingSent ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
           </Button>
          </div>

          {loadingSent ? (
           <div className="flex items-center justify-center py-12">
             <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
           </div>
          ) : sentEmails.length === 0 ? (
           <div className="text-center py-12" style={{ color: 'rgba(26,26,26,0.4)' }}>
             <SendHorizontal className="w-8 h-8 mx-auto mb-3 opacity-40" />
             <p>No sent emails yet</p>
           </div>
          ) : (
           sentEmails.map(email => (
             <button key={email.id} onClick={() => { setSelectedEmail(email); setEmailModalOpen(true); }} className="w-full text-left rounded-lg border p-4 hover:opacity-80 transition flex items-start justify-between gap-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: email.status === 'success' ? '#22c55e' : email.status === 'failed' ? '#ef4444' : '#888' }}>
                     {email.status || 'sent'}
                   </span>
                   <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                     {email.created_date ? format(new Date(email.created_date), "MMM d, yyyy h:mm a") : ''}
                   </span>
                 </div>
                 <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>To: {email.recipient_email}</p>
                 <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{email.subject || '(no subject)'}</p>
                 {email.error_message && <p className="text-xs text-red-500 mt-1">{email.error_message}</p>}
               </div>
             </button>
           ))
          )}
          </div>
          )}

          {/* DRAFTS */}
          {tab === "drafts" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Unsent draft emails saved locally</p>
              </div>

              {drafts.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'rgba(26,26,26,0.4)' }}>
                  <PenLine className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p>No drafts yet</p>
                </div>
              ) : (
                drafts.map(draft => (
                  <div key={draft.id} className="rounded-lg border p-4 flex items-start justify-between gap-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#888' }}>draft</span>
                        <span className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{format(new Date(draft.savedAt), "MMM d, yyyy h:mm a")}</span>
                      </div>
                      <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>To: {draft.to}</p>
                      <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{draft.subject || '(no subject)'}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => { setFormData({ to: draft.to, subject: draft.subject, body: draft.body }); setTab("compose"); }} style={{ backgroundColor: '#B8956A', color: '#fff' }} className="gap-1">
                        <PenLine className="w-3 h-3" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDrafts(prev => prev.filter(d => d.id !== draft.id))} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

               {/* Gmail-Like Inbox View */}
               {emailModalOpen && (
                 <GmailLikeInbox
                   email={selectedEmail}
                   onClose={() => setEmailModalOpen(false)}
                   salesMember={salesMember}
                   salesMemberId={salesMemberId}
                 />
               )}
              </div>
            );
          }