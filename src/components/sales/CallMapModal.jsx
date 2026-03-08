import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Phone, RefreshCw, Mail, ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function CallMapModal({ contact, script, onClose, onRegenerate, regenerating, open = true }) {
  const [showContextBox, setShowContextBox] = useState(false);
  const [context, setContext] = useState("");

  if (!script) return null;

  const handleRegenerate = () => {
    if (onRegenerate) onRegenerate(context);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4" style={{ color: '#B8956A' }} />
            Call Map — {contact?.name}
          </DialogTitle>
        </DialogHeader>

        {(contact?.phone || contact?.email) && (
          <div className="flex gap-2 px-6 py-3 border-b border-gray-100 shrink-0">
            {contact?.phone && (
              <Button
                size="sm"
                className="gap-2"
                style={{ backgroundColor: '#B8956A', color: '#fff' }}
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new CustomEvent('openDialer', { detail: { phone: contact.phone } }));
                }}
              >
                <Phone className="w-4 h-4" /> Call
              </Button>
            )}
            {contact?.email && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
              >
                <Mail className="w-4 h-4" /> Email
              </Button>
            )}
          </div>
        )}

        {onRegenerate && (
          <div className="px-6 py-3 border-b border-gray-100 shrink-0 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.04)' }}>
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:opacity-70 transition-opacity"
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
              <div className="px-3 pb-3 space-y-2 mt-2">
                <Textarea
                  placeholder="Add context to improve the call map…"
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-sm max-w-none text-sm leading-relaxed">
            <ReactMarkdown
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
              {script}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}