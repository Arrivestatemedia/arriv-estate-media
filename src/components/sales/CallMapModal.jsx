import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Phone, RefreshCw, Mail, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function CallMapModal({ contact, script, onClose, onRegenerate, regenerating }) {
  const [showContextBox, setShowContextBox] = useState(false);
  const [context, setContext] = useState("");

  if (!script) return null;

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate(context);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" style={{ color: '#B8956A' }} />
              Call Map — {contactName}
            </DialogTitle>
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

        {onRegenerate && (
          <div className="shrink-0 rounded-xl border" style={{ borderColor: 'rgba(184,149,106,0.3)', backgroundColor: 'rgba(184,149,106,0.04)' }}>
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium"
              style={{ color: '#B8956A' }}
              onClick={() => setShowContextBox(v => !v)}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate Call Map
              </span>
              {showContextBox ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showContextBox && (
              <div className="px-4 pb-3 space-y-2">
                <Textarea
                  placeholder="Add context to improve the call map… e.g. 'She mentioned she was moving offices next month' or 'I already sent the portfolio link twice'"
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                  style={{ borderColor: 'rgba(184,149,106,0.3)' }}
                />
                <Button
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="gap-1.5"
                  style={{ backgroundColor: '#B8956A', color: '#fff' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? "Regenerating..." : "Regenerate"}
                </Button>
              </div>
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