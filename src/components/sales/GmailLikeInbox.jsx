import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, Reply, ReplyAll, Share2, Archive, Trash2, Image as ImageIcon, Download, FileText } from "lucide-react";
import { format } from "date-fns";

export default function GmailLikeInbox({ email, onClose, salesMember, salesMemberId }) {
  const [loading, setLoading] = useState(false);
  const [fullContent, setFullContent] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [replyMode, setReplyMode] = useState(null);
  const [replyFormData, setReplyFormData] = useState({ to: "", cc: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (email) {
      setLoading(true);
      const loadEmailContent = async () => {
        try {
          let content = email.message_content || email.body || email.snippet || "";
          let attachmentList = [];

          // Extract body from payload if not already present
          if (!content && email.payload) {
            try {
              const extractBody = (payload) => {
                if (payload.parts) {
                  for (const part of payload.parts) {
                    if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                      if (part.body?.data) {
                        const decoded = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                        return decoded;
                      }
                    }
                    const nested = extractBody(part);
                    if (nested) return nested;
                  }
                } else if (payload.body?.data) {
                  const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                  return decoded;
                }
                return '';
              };
              content = extractBody(email.payload) || content;
            } catch (e) {
              console.error("Failed to extract body from payload:", e);
            }
          }

          // Fetch attachments from Gmail
          if (email.id && email.parts && Array.isArray(email.parts) && email.parts.length > 0) {
            try {
              const partsWithData = email.parts.filter(part => 
                part.partId && (
                  part.mimeType?.startsWith('image/') ||
                  part.mimeType?.startsWith('application/') ||
                  part.filename
                )
              );
              
              if (partsWithData.length > 0) {
                const attachRes = await base44.functions.invoke('getGmailAttachments', {
                  messageId: email.id,
                  parts: partsWithData
                });
                if (attachRes.data?.attachments && Array.isArray(attachRes.data.attachments)) {
                  attachmentList = attachRes.data.attachments;
                }
              }
            } catch (e) {
              console.error("Failed to fetch attachments:", e);
            }
          }
          
          setFullContent(content);
          setAttachments(attachmentList);
        } catch (e) {
          console.error(e);
          setFullContent(email.message_content || email.body || email.snippet || "");
          setAttachments([]);
        } finally {
          setLoading(false);
        }
      };
      
      loadEmailContent();
    }
  }, [email]);

  const handleReply = (isReplyAll = false) => {
    const subject = email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(no subject)'}`;
    const fromEmail_clean = email.from?.match(/<(.+?)>/)?.[1] || email.from;
    
    // Include original message as quoted text
    const originalMessage = `
---
On ${format(new Date(email.date || email.created_date), "PPP p")}, ${fromName} <${fromEmail}> wrote:

${fullContent || email.snippet || ""}`;
    
    setReplyMode(isReplyAll ? "replyAll" : "reply");
    setReplyFormData({ to: fromEmail_clean, cc: "", subject, body: originalMessage });
  };

  const handleForward = () => {
    const subject = email.subject?.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject || '(no subject)'}`;
    
    // Include original message as quoted text
    const originalMessage = `
---
Forwarded message:
From: ${fromName} <${fromEmail}>
Subject: ${email.subject || '(no subject)'}
Date: ${format(new Date(email.date || email.created_date), "PPP p")}

${fullContent || email.snippet || ""}`;
    
    setReplyMode("forward");
    setReplyFormData({ to: "", cc: "", subject, body: originalMessage });
  };

  const handleSendReply = async () => {
    if (!replyFormData.to || !replyFormData.subject || !replyFormData.body) {
      alert("Please fill in all fields");
      return;
    }
    setSending(true);
    try {
      const emailToUse = salesMember?.company_email || salesMember?.email;
      await base44.functions.invoke('sendEmailViaGmail', {
        to: replyFormData.to,
        cc: replyFormData.cc || undefined,
        subject: replyFormData.subject,
        body: replyFormData.body,
        fromEmail: emailToUse || undefined,
        fromName: salesMember?.full_name || undefined,
        salesMemberId: salesMemberId || undefined,
        inReplyTo: email?.messageId,
        references: email?.references ? `${email.references} ${email.messageId}` : email?.messageId,
      });
      alert("Reply sent successfully!");
      setReplyMode(null);
      setReplyFormData({ to: "", cc: "", subject: "", body: "" });
    } catch (error) {
      alert("Failed to send reply: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (attachment) => {
    try {
      if (attachment.data) {
        // Decode base64
        const binaryString = atob(attachment.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: attachment.mimeType || 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.filename || 'attachment';
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }
    } catch (err) {
      alert("Failed to download: " + err.message);
    }
  };

  if (!email) return null;

  const fromLine = email.from || email.sender || email.sales_member_email || "";
  const fromEmail = fromLine.match(/<(.+?)>/)?.[1] || fromLine;
  const fromName = fromLine.replace(/<.+?>/g, "").trim() || fromEmail;
  const toLine = email.to || email.recipient_email || "";
  const subject = email.subject || "(no subject)";
  const date = email.date || email.created_date || new Date().toISOString();

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <button onClick={onClose} className="flex items-center gap-2 text-sm font-medium mb-3 hover:opacity-70" style={{ color: '#B8956A' }}>
              <ChevronLeft className="w-4 h-4" /> Back to Inbox
            </button>
            <h1 className="text-2xl font-bold break-words" style={{ color: '#1A1A1A' }}>{subject}</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="icon" variant="ghost" title="Archive">
              <Archive className="w-4 h-4" style={{ color: 'rgba(26,26,26,0.6)' }} />
            </Button>
            <Button size="icon" variant="ghost" title="Delete">
              <Trash2 className="w-4 h-4" style={{ color: 'rgba(26,26,26,0.6)' }} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* From/To/Date */}
        <div className="mb-6 pb-6 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#B8956A] to-[#9a7d5a] flex items-center justify-center text-white font-bold">
                {fromName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold" style={{ color: '#1A1A1A' }}>{fromName}</p>
                <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>{fromEmail}</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>
              {format(new Date(date), "MMM d, yyyy h:mm a")}
            </p>
          </div>
          <div className="ml-13">
            <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>
              <span className="font-semibold">to</span> {toLine}
            </p>
          </div>
        </div>

        {/* Email Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
          </div>
        ) : (
          <div className="mb-8 leading-relaxed" style={{ color: '#1A1A1A' }}>
            {fullContent && fullContent.includes('<') && fullContent.includes('>') ? (
              <div dangerouslySetInnerHTML={{ __html: fullContent }} className="whitespace-pre-wrap text-sm" />
            ) : (
              <div className="whitespace-pre-wrap text-sm">{fullContent}</div>
            )}
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mb-8 pb-8 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            <h3 className="font-semibold mb-4" style={{ color: '#1A1A1A' }}>
              Attachments ({attachments.length})
            </h3>
            <div className="space-y-4">
              {/* Image Previews */}
              <div className="grid grid-cols-3 gap-4">
                {attachments
                  .filter(att => /\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || ""))
                  .map((attachment, idx) => (
                    <div key={idx} className="rounded-lg border overflow-hidden bg-gray-100" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                      {attachment.dataUrl ? (
                        <img src={attachment.dataUrl} alt={attachment.filename} className="w-full h-40 object-cover" />
                      ) : (
                        <div className="w-full h-40 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="p-2 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                        <p className="text-xs truncate text-gray-700 mb-2">{attachment.filename}</p>
                        <Button size="sm" variant="ghost" onClick={() => handleDownload(attachment)} className="w-full gap-1 text-xs" style={{ color: '#B8956A' }}>
                          <Download className="w-3 h-3" /> Download
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Other Files */}
              <div className="space-y-2">
                {attachments
                  .filter(att => !/\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || ""))
                  .map((attachment, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                      <div className="flex items-center gap-2 flex-1">
                        <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                        <span className="text-sm truncate">{attachment.filename}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(attachment)} className="gap-1" style={{ color: '#B8956A' }}>
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Reply/Reply All/Forward Buttons */}
        {!replyMode && (
          <div className="flex gap-2 mb-8">
            <Button onClick={() => handleReply(false)} className="gap-2" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
              <Reply className="w-4 h-4" /> Reply
            </Button>
            <Button onClick={() => handleReply(true)} variant="outline" className="gap-2" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              <ReplyAll className="w-4 h-4" /> Reply All
            </Button>
            <Button onClick={handleForward} variant="outline" className="gap-2" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              <Share2 className="w-4 h-4" /> Forward
            </Button>
          </div>
        )}

        {/* Reply Form */}
        {replyMode && (
          <div className="border-t pt-8" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            <h3 className="font-semibold mb-4" style={{ color: '#1A1A1A' }}>
              {replyMode === "replyAll" ? "Reply All" : replyMode === "forward" ? "Forward" : "Reply"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>To</label>
                <Input type="email" value={replyFormData.to} onChange={e => setReplyFormData(f => ({ ...f, to: e.target.value }))} className="text-sm" />
              </div>
              {replyMode === "replyAll" && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>CC</label>
                  <Input type="email" placeholder="Optional" value={replyFormData.cc} onChange={e => setReplyFormData(f => ({ ...f, cc: e.target.value }))} className="text-sm" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Subject</label>
                <Input value={replyFormData.subject} onChange={e => setReplyFormData(f => ({ ...f, subject: e.target.value }))} className="text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: '#1A1A1A' }}>Message</label>
                <Textarea value={replyFormData.body} onChange={e => setReplyFormData(f => ({ ...f, body: e.target.value }))} rows={8} className="text-sm" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSendReply} disabled={sending} className="px-6" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
                  {sending ? "Sending..." : "Send"}
                </Button>
                <Button onClick={() => { setReplyMode(null); setReplyFormData({ to: "", cc: "", subject: "", body: "" }); }} variant="outline" className="px-6" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}