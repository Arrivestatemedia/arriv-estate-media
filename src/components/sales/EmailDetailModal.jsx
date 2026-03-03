import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, FileText, Image as ImageIcon, X } from "lucide-react";
import { format } from "date-fns";

export default function EmailDetailModal({ email, open, onClose, type = "inbox" }) {
  const [loading, setLoading] = useState(false);
  const [fullContent, setFullContent] = useState(null);
  const [attachments, setAttachments] = useState([]);

  useEffect(() => {
    if (open && email) {
      setLoading(true);
      try {
        // Parse email content
        let content = email.message_content || email.body || email.snippet || "";
        let attachmentList = [];

        // Extract attachments from email if they exist
        if (email.attachments && Array.isArray(email.attachments)) {
          attachmentList = email.attachments;
        }
        // Look for URLs in content that might be attachments
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = content.match(urlRegex) || [];
        
        setFullContent(content);
        setAttachments(attachmentList.length > 0 ? attachmentList : urls.map(url => ({ url, filename: url.split('/').pop() })));
      } catch (e) {
        console.error(e);
        setFullContent(email.message_content || email.body || email.snippet || "");
      } finally {
        setLoading(false);
      }
    }
  }, [open, email]);

  if (!email) return null;

  const handleDownload = async (attachment) => {
    try {
      const url = attachment.url || attachment;
      const filename = attachment.filename || attachment.name || url.split('/').pop();
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(link);
    } catch (err) {
      alert("Failed to download attachment: " + err.message);
    }
  };

  const fromLine = email.from || email.sender || email.sales_member_email || "";
  const fromEmail = fromLine.match(/<(.+?)>/)?.[1] || fromLine;
  const fromName = fromLine.replace(/<.+?>/g, "").trim() || fromEmail;
  const toLine = email.to || email.recipient_email || "";
  const subject = email.subject || "(no subject)";
  const date = email.date || email.created_date || new Date().toISOString();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-white z-10 border-b pb-4">
          <DialogTitle className="text-left line-clamp-2">{subject}</DialogTitle>
          <DialogClose className="absolute right-4 top-4" />
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Email Header */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm border" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
            <div>
              <span className="font-semibold text-gray-600">From:</span> {fromName} &lt;{fromEmail}&gt;
            </div>
            <div>
              <span className="font-semibold text-gray-600">To:</span> {toLine}
            </div>
            <div>
              <span className="font-semibold text-gray-600">Date:</span> {format(new Date(date), "PPP p")}
            </div>
          </div>

          {/* Email Body */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none break-words" style={{ color: '#1A1A1A' }}>
              {/* HTML email or plain text */}
              {fullContent && fullContent.includes('<') && fullContent.includes('>') ? (
                <div dangerouslySetInnerHTML={{ __html: fullContent }} className="whitespace-pre-wrap text-sm leading-relaxed" />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed bg-white p-4 rounded-lg border" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                  {fullContent}
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-3" style={{ color: '#1A1A1A' }}>
                Attachments ({attachments.length})
              </h3>
              <div className="grid gap-2">
                {attachments.map((attachment, idx) => {
                  const filename = attachment.filename || attachment.name || attachment.url?.split('/').pop() || `attachment-${idx + 1}`;
                  const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(filename);
                  const isPdf = /\.pdf$/i.test(filename);

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition"
                      style={{ borderColor: 'rgba(184,149,106,0.2)' }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isImage ? (
                          <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                        ) : isPdf ? (
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                        )}
                        <span className="text-sm truncate text-gray-700">{filename}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownload(attachment)}
                        className="gap-1 shrink-0"
                        style={{ color: '#B8956A' }}
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}