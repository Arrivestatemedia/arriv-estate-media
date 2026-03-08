import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, RefreshCw, Mail } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function CallMapModal({ open, onClose, contactName, callMap, onRegenerate, regenerating, contactPhone, contactEmail, onCall, onEmail }) {
  if (!callMap) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" style={{ color: '#B8956A' }} />
              Call Map — {contactName}
            </DialogTitle>
            {onRegenerate && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRegenerate}
                disabled={regenerating}
                className="gap-1 text-xs"
                style={{ borderColor: 'rgba(184,149,106,0.4)', color: 'rgba(26,26,26,0.6)' }}
              >
                <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? "Regenerating..." : "Regenerate"}
              </Button>
            )}
          </div>
        </DialogHeader>

        {(contactPhone || contactEmail) && (
          <div className="flex gap-2 shrink-0 mb-2">
            {contactPhone && (
              <Button
                size="sm"
                className="gap-2"
                style={{ backgroundColor: '#B8956A', color: '#fff' }}
                onClick={() => { onClose(); onCall && onCall(contactPhone); }}
              >
                <Phone className="w-4 h-4" /> Call
              </Button>
            )}
            {contactEmail && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => { onClose(); onEmail && onEmail(contactEmail); }}
              >
                <Mail className="w-4 h-4" /> Email
              </Button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-2">
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: 'rgba(184,149,106,0.05)', border: '1px solid rgba(184,149,106,0.2)' }}
          >
            <ReactMarkdown
              className="prose prose-sm max-w-none text-sm leading-relaxed"
              components={{
                h3: ({ children }) => (
                  <h3 className="text-sm font-bold mt-4 mb-1.5 first:mt-0" style={{ color: '#1A1A1A' }}>{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="my-1.5 leading-relaxed" style={{ color: '#1A1A1A' }}>{children}</p>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold" style={{ color: '#1A1A1A' }}>{children}</strong>
                ),
                hr: () => (
                  <hr className="my-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }} />
                ),
                ul: ({ children }) => (
                  <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
                ),
                li: ({ children }) => (
                  <li className="text-sm" style={{ color: '#1A1A1A' }}>{children}</li>
                ),
              }}
            >
              {callMap}
            </ReactMarkdown>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}