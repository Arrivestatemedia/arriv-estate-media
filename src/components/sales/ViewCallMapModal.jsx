import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Phone, Mail, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

export default function ViewCallMapModal({ activity, open, onOpenChange }) {
  const [callMap, setCallMap] = useState(activity?.call_map || "");
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);

  const regenerateCallMap = async () => {
    setRegenerating(true);
    try {
      const res = await base44.functions.invoke('regenerateCallMap', {
        contactName: activity.contact_name,
        contactEmail: activity.contact_email,
        companyName: activity.company_name,
        contactPhone: activity.contact_phone,
      });
      
      const newCallMap = res.data?.call_map;
      if (!newCallMap || typeof newCallMap !== 'string' || newCallMap.trim().length === 0) {
        console.error('Invalid call map response:', res.data);
        setCallMap("");
        return;
      }
      
      setCallMap(newCallMap);
      await base44.entities.ActivityLog.update(activity.id, { call_map: newCallMap });
      setShowRegenerateOptions(false);
    } catch (e) {
      console.error('Regenerate failed:', e);
      setCallMap("");
    } finally {
      setRegenerating(false);
    }
  };

  const contactName = activity?.contact_name || "Contact";

  // Try to parse call_map as JSON; if it fails, treat as markdown text
  const parseCallMap = () => {
    if (!callMap) return null;
    try {
      const parsed = typeof callMap === 'string' ? JSON.parse(callMap) : callMap;
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      // Not JSON — it's markdown/text format, return null so we render as markdown
      return null;
    }
  };

  const callMapData = parseCallMap();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" style={{ backgroundColor: '#FFFFFF' }}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <Phone className="w-5 h-5" style={{ color: '#B8956A' }} />
              Call Map — {contactName}
            </DialogTitle>
            <DialogClose />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action buttons */}
          <div className="flex gap-2 items-center">
            <Button size="sm" className="gap-2" style={{ backgroundColor: '#B8956A', color: '#FFFFFF' }}>
              <Phone className="w-4 h-4" />
              Call
            </Button>
            <Button size="sm" variant="outline" className="gap-2" style={{ borderColor: '#B8956A', color: '#B8956A' }}>
              <Mail className="w-4 h-4" />
              Email
            </Button>
            <div className="ml-auto relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRegenerateOptions(!showRegenerateOptions)}
                disabled={regenerating}
                className="gap-2"
                style={{ borderColor: '#B8956A', color: '#B8956A' }}
              >
                <RefreshCw className="w-4 h-4" />
                Regenerate Call Map
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Call map content */}
          {callMap ? (
            <div className="rounded-lg p-4 space-y-4" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
              {callMapData ? (
                <div className="space-y-4">
                  {callMapData.opening && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>📞</span> Opening
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.opening}</p>
                    </div>
                  )}
                  {callMapData.if_interested && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>🟢</span> If interested
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_interested}</p>
                    </div>
                  )}
                  {callMapData.if_has_photographer && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>🔄</span> Already has photographer
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_has_photographer}</p>
                    </div>
                  )}
                  {callMapData.if_not_interested && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>⏸️</span> Not interested now
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_not_interested}</p>
                    </div>
                  )}
                  {callMapData.if_send_email && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>📧</span> Send email
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_send_email}</p>
                    </div>
                  )}
                  {callMapData.if_too_expensive && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>💰</span> Too expensive
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_too_expensive}</p>
                    </div>
                  )}
                  {callMapData.if_cold_unengaged && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>❄️</span> Cold/unresponsive
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_cold_unengaged}</p>
                    </div>
                  )}
                  {callMapData.if_busy_bad_time && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>⏰</span> Busy/bad timing
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.if_busy_bad_time}</p>
                    </div>
                  )}
                  {callMapData.if_no_answer_voicemail && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>📵</span> Voicemail
                      </h3>
                      <p className="text-sm leading-relaxed italic" style={{ color: '#1A1A1A' }}>{callMapData.if_no_answer_voicemail}</p>
                    </div>
                  )}
                  {callMapData.follow_up_text && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span>📱</span> Follow-up text
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: '#1A1A1A' }}>{callMapData.follow_up_text}</p>
                    </div>
                  )}
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-3 text-sm" style={{ color: '#1A1A1A' }}>{children}</p>,
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold mt-4 mb-2 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
                        <span style={{ color: '#B8956A' }}>📋</span>
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1" style={{ color: '#1A1A1A' }}>{children}</ul>,
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold" style={{ color: '#1A1A1A' }}>{children}</strong>,
                  }}
                >
                  {callMap}
                </ReactMarkdown>
              )}
            </div>
          ) : (
            <div className="py-8 text-center" style={{ color: 'rgba(26,26,26,0.5)' }}>
              {regenerating ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating call map...
                </div>
              ) : (
                <p>No call map available</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}