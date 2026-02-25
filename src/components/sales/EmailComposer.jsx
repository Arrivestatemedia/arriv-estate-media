import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, Loader2, Inbox, PenLine, ChevronDown, ChevronUp, Clock, Trash2, Calendar } from "lucide-react";
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
  const [expandedReply, setExpandedReply] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyMode, setReplyMode] = useState(null);
  const [replyFormData, setReplyFormData] = useState({ to: "", cc: "", subject: "", body: "" });

  const lastInboxCountRef = React.useRef(null);

  useEffect(() => {
    if (isAdmin) {
      base44.auth.me().then(adminUser => {
        if (adminUser?.email) {
          base44.entities.SalesTeamMember.filter({ email: adminUser.email }).then(members => {
            if (members?.[0]) {
              setSalesMember(members[0]);
              if (members[0].company_email) setFromEmail(members[0].company_email);
            } else {
              setSalesMember(adminUser);
            }
          }).catch(() => setSalesMember(adminUser));
        } else {
          setSalesMember(adminUser);
        }
      }).catch(() => {});
    } else if (salesMemberId) {
      base44.entities.SalesTeamMember.get(salesMemberId).then(member => {
        setSalesMember(member);
        if (member?.company_email) setFromEmail(member.company_email);
      }).catch(() => {});
    }
  }, [salesMemberId, isAdmin]);

  useEffect(() => {
    if (tab === "replies" && salesMember) loadReplies();
    if (tab === "scheduled") loadScheduledEmails();
  }, [tab, salesMember]);

  useEffect(() => {
    if (!salesMemberId || !salesMember?.company_email) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const checkInbox = async () => {
      try {
        const res = await base44.functions.invoke('getGmailReplies', { contactEmails: [], toEmail: fromEmail || salesMember?.company_email });
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
  }, [salesMemberId, fromEmail, salesMember?.company_email]);

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
      const res = await base44.functions.invoke('getGmailReplies', { contactEmails: [], toEmail: fromEmail || salesMember?.company_email });
      setReplies(res.data?.threads || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReplies(false);
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
        await base44.entities.ScheduledEmail.create({
          sales_member_id: salesMemberId,
          sales_member_email: salesMember?.email,
          to: formData.to,
          subject: formData.subject,
          body: formData.body,
          from_email: fromEmail || undefined,
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
      await base44.functions.invoke('sendEmailViaGmail', {
        ...formData,
        contactEmail: selectedContact?.email,
        fromEmail: fromEmail || undefined,
        fromName: salesMember?.full_name || undefined,
        salesMemberId: salesMemberId || undefined,
        contactName: selectedContact ? `${selectedContact.firstname || ''} ${selectedContact.lastname || ''}`.trim() : undefined,
      });
      setSent(true);
      setFormData({ to: "", subject: "", body: "" });
      setSelectedContact(null);
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
      await base44.functions.invoke('scheduleGoogleCalendarInvite', {
        title: meetingData.title,
        description: meetingData.description || '',
        startTime: new Date(meetingData.startTime).toISOString(),
        endTime: new Date(meetingData.endTime).toISOString(),
        clientEmails: [selectedContact.email],
        salesRepCompanyEmail: salesMember?.company_email
      });
      alert(`Meeting scheduled! Invite sent to ${selectedContact?.firstname}`);
      setMeetingData({ title: "", startTime: "", endTime: "", description: "" });
      setSelectedContact(null);
      setScheduleMeetingMode(false);
    } catch (error) {
      alert("Failed to schedule meeting: " + error.message);
    } finally {
      setInvitingClients(false);
    }
  };

  const handleReply = (reply, isReplyAll = false) => {
    const subject = reply.subject?.startsWith('Re:') ? reply.subject : `Re: ${reply.subject || '(no subject)'}`;
    const fromEmail_clean = reply.from.match(/<(.+?)>/)?.[1] || reply.from;
    setReplyingTo(reply);
    setReplyMode(isReplyAll ? "replyAll" : "reply");
    setReplyFormData({ to: fromEmail_clean, cc: "", subject, body: "" });
    setExpandedReply(reply.id);
  };

  const handleSendReply = async () => {
    if (!replyFormData.to || !replyFormData.subject || !replyFormData.body) {
      alert("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      await base44.functions.invoke('sendEmailViaGmail', {
        to: replyFormData.to,
        cc: replyFormData.cc || undefined,
        subject: replyFormData.subject,
        body: replyFormData.body,
        fromEmail: fromEmail || undefined,
        fromName: salesMember?.full_name || undefined,
        salesMemberId: salesMemberId || undefined,
        inReplyTo: replyingTo?.messageId,
        references: replyingTo?.references ? `${replyingTo.references} ${replyingTo.messageId}` : replyingTo?.messageId,
      });
      setSent(true);
      setReplyingTo(null);
      setReplyMode(null);
      setReplyFormData({ to: "", cc: "", subject: "", body: "" });
      setTimeout(() => setSent(false), 3000);
    } catch (error) {
      alert("Failed to send reply: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const statusColor = { pending: '#B8956A', sent: '#22c55e', failed: '#ef4444' };
  const fromOptions = salesMember?.company_email ? [{ label: salesMember.company_email, value: salesMember.company_email }] : [];

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        <button onClick={() => setTab("compose")} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "compose" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "compose" ? '#B8956A' : 'transparent' }}>
          <PenLine className="w-4 h-4" /> Compose
        </button>
        <button onClick={() => setTab("replies")} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "replies" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "replies" ? '#B8956A' : 'transparent' }}>
          <Inbox className="w-4 h-4" /> Inbox
        </button>
        <button onClick={() => setTab("scheduled")} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition" style={{ color: tab === "scheduled" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "scheduled" ? '#B8956A' : 'transparent' }}>
          <Clock className="w-4 h-4" /> Scheduled
        </button>
      </div>

      {/* COMPOSE */}
      {tab === "compose" && (
        <div className="space-y-4">
          {fromOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>From</label>
              <div className="flex flex-col gap-2">
                {fromOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg border transition" style={{ borderColor: fromEmail === opt.value ? '#B8956A' : 'rgba(184,149,106,0.2)', backgroundColor: fromEmail === opt.value ? 'rgba(184,149,106,0.08)' : 'transparent' }}>
                    <input type="radio" name="from" value={opt.value} checked={fromEmail === opt.value} onChange={() => setFromEmail(opt.value)} className="accent-[#B8956A]" />
                    <span className="text-sm" style={{ color: '#1A1A1A' }}>{opt.label}</span>
                  </label>
                ))}
              </div>
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

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Subject</label>
            <Input placeholder="Email subject..." value={formData.subject} onChange={e => setFormData(f => ({ ...f, subject: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>Message</label>
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

          <div className="flex gap-2">
            <Button onClick={handleSendEmail} disabled={sending || sent || (scheduleMode && !scheduledFor)} className="flex-1 gap-2" style={{ backgroundColor: sent ? '#22c55e' : '#B8956A', color: sent ? '#fff' : '#1A1A1A' }}>
              {scheduleMode ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : sent ? (scheduleMode ? "Scheduled!" : "Sent!") : scheduleMode ? "Schedule Email" : "Send Email"}
            </Button>
            <Button onClick={() => setScheduleMeetingMode(!scheduleMeetingMode)} variant="outline" className="gap-2" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              <Calendar className="w-4 h-4" />
              Schedule Meeting
            </Button>
          </div>

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
                <div className="flex gap-2">
                  <Button onClick={handleScheduleMeeting} disabled={invitingClients} className="flex-1" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                    {invitingClients ? "Sending..." : "Send Invite"}
                  </Button>
                  <Button onClick={() => setScheduleMeetingMode(false)} variant="outline" className="flex-1" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
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
            replies.map(reply => {
              const isExpanded = expandedReply === reply.id;
              const isReplyingToThis = replyingTo?.id === reply.id;
              return (
                <div key={reply.id} className="rounded-lg border overflow-hidden" style={{ borderColor: isExpanded ? '#B8956A' : 'rgba(184,149,106,0.2)', backgroundColor: isExpanded ? 'rgba(184,149,106,0.05)' : '#fff' }}>
                  <button onClick={() => setExpandedReply(isExpanded ? null : reply.id)} className="w-full text-left p-4 hover:opacity-80 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{reply.from}</p>
                        <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{reply.subject || '(no subject)'}</p>
                        {!isExpanded && <p className="text-xs mt-1 truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>{reply.snippet}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>{reply.date ? format(new Date(reply.date), "MMM d") : ''}</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 pt-3 text-sm border-t" style={{ borderColor: 'rgba(184,149,106,0.2)', color: '#1A1A1A' }}>
                        {reply.snippet}
                      </div>
                    )}
                  </button>

                  {isExpanded && !isReplyingToThis && (
                    <div className="border-t px-4 py-3 flex gap-2" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                      <Button size="sm" variant="outline" onClick={() => handleReply(reply, false)} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Reply</Button>
                      <Button size="sm" variant="outline" onClick={() => handleReply(reply, true)} style={{ borderColor: '#B8956A', color: '#B8956A' }}>Reply All</Button>
                    </div>
                  )}

                  {isReplyingToThis && (
                    <div className="border-t p-4 space-y-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>To</label>
                        <Input type="email" value={replyFormData.to} onChange={e => setReplyFormData(f => ({ ...f, to: e.target.value }))} className="text-sm" />
                      </div>
                      {replyMode === "replyAll" && (
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>CC</label>
                          <Input type="email" placeholder="Optional" value={replyFormData.cc} onChange={e => setReplyFormData(f => ({ ...f, cc: e.target.value }))} className="text-sm" />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Subject</label>
                        <Input value={replyFormData.subject} onChange={e => setReplyFormData(f => ({ ...f, subject: e.target.value }))} className="text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: '#1A1A1A' }}>Message</label>
                        <Textarea value={replyFormData.body} onChange={e => setReplyFormData(f => ({ ...f, body: e.target.value }))} rows={6} className="text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSendReply} disabled={sending} className="flex-1" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                          {sending ? "Sending..." : "Send Reply"}
                        </Button>
                        <Button onClick={() => { setReplyingTo(null); setReplyMode(null); setReplyFormData({ to: "", cc: "", subject: "", body: "" }); }} variant="outline" className="flex-1" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}