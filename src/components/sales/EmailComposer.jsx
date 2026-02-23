import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Loader2, Inbox, PenLine, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function EmailComposer({ salesMemberId }) {
  const [tab, setTab] = useState("compose"); // "compose" | "replies"
  const [salesMember, setSalesMember] = useState(null);

  // Compose state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [fromEmail, setFromEmail] = useState(""); // which address to send from
  const [formData, setFormData] = useState({ to: "", subject: "", body: "" });

  // Replies state
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [expandedReply, setExpandedReply] = useState(null);

  // Load sales member info to get company_email
  useEffect(() => {
    if (!salesMemberId) return;
    base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
      if (members[0]) {
        setSalesMember(members[0]);
        // Default from = company_email if set, else login email
        setFromEmail(members[0].company_email || members[0].email || "");
      }
    }).catch(() => {});
  }, [salesMemberId]);

  // Load replies when switching to replies tab
  useEffect(() => {
    if (tab !== "replies") return;
    loadReplies();
  }, [tab]);

  const loadReplies = async () => {
    setLoadingReplies(true);
    try {
      // Get all contacts this rep has emailed (from activity log)
      const activities = await base44.entities.ActivityLog.list('-activity_date', 200);
      const mine = activities.filter(a =>
        a.sales_member_id === salesMemberId || a.sales_member_email === salesMember?.email
      );
      const contactEmails = [...new Set(mine.map(a => a.contact_email).filter(Boolean))];

      if (contactEmails.length === 0) {
        setReplies([]);
        setLoadingReplies(false);
        return;
      }

      const res = await base44.functions.invoke('getGmailReplies', { contactEmails });
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

  // From options
  const fromOptions = [];
  if (salesMember?.company_email) fromOptions.push({ label: `Company — ${salesMember.company_email}`, value: salesMember.company_email });
  if (salesMember?.email) fromOptions.push({ label: `Login — ${salesMember.email}`, value: salesMember.email });

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        <button
          onClick={() => setTab("compose")}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition"
          style={{ color: tab === "compose" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "compose" ? '#B8956A' : 'transparent' }}
        >
          <PenLine className="w-4 h-4" /> Compose
        </button>
        <button
          onClick={() => setTab("replies")}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition"
          style={{ color: tab === "replies" ? '#B8956A' : 'rgba(26,26,26,0.5)', borderBottomColor: tab === "replies" ? '#B8956A' : 'transparent' }}
        >
          <Inbox className="w-4 h-4" /> Contact Replies
        </button>
      </div>

      {/* ── COMPOSE ── */}
      {tab === "compose" && (
        <div className="space-y-4">
          {/* From selector */}
          {fromOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>From</label>
              <div className="flex flex-col gap-2">
                {fromOptions.map(opt => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg border transition" style={{ borderColor: fromEmail === opt.value ? '#B8956A' : 'rgba(184,149,106,0.2)', backgroundColor: fromEmail === opt.value ? 'rgba(184,149,106,0.08)' : 'transparent' }}>
                    <input
                      type="radio"
                      name="from"
                      value={opt.value}
                      checked={fromEmail === opt.value}
                      onChange={() => setFromEmail(opt.value)}
                      className="accent-[#B8956A]"
                    />
                    <span className="text-sm" style={{ color: '#1A1A1A' }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Contact search */}
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

          <Button
            onClick={handleSendEmail}
            disabled={sending || sent}
            className="w-full gap-2"
            style={{ backgroundColor: sent ? '#22c55e' : '#B8956A', color: sent ? '#fff' : '#1A1A1A' }}
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending..." : sent ? "Sent!" : "Send Email"}
          </Button>
        </div>
      )}

      {/* ── REPLIES ── */}
      {tab === "replies" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Emails received from contacts you've worked with</p>
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
              <p>No replies from contacts yet</p>
            </div>
          ) : (
            replies.map(reply => {
              const isExpanded = expandedReply === reply.id;
              return (
                <button
                  key={reply.id}
                  onClick={() => setExpandedReply(isExpanded ? null : reply.id)}
                  className="w-full text-left p-4 rounded-lg border transition"
                  style={{ borderColor: isExpanded ? '#B8956A' : 'rgba(184,149,106,0.2)', backgroundColor: isExpanded ? 'rgba(184,149,106,0.05)' : '#fff' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{reply.from}</p>
                      <p className="text-sm truncate" style={{ color: 'rgba(26,26,26,0.7)' }}>{reply.subject || '(no subject)'}</p>
                      {!isExpanded && <p className="text-xs mt-1 truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>{reply.snippet}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs" style={{ color: 'rgba(26,26,26,0.4)' }}>
                        {reply.date ? format(new Date(reply.date), "MMM d") : ''}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 text-sm border-t" style={{ borderColor: 'rgba(184,149,106,0.2)', color: '#1A1A1A' }}>
                      {reply.snippet}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}