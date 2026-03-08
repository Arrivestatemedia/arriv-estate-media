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
        activityId: activity.id,
        contactName: activity.contact_name,
        contactEmail: activity.contact_email,
        companyName: activity.company_name,
      });
      
      const newCallMap = res.data?.call_map || "";
      setCallMap(newCallMap);
      await base44.entities.ActivityLog.update(activity.id, { call_map: newCallMap });
      setShowRegenerateOptions(false);
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(false);
    }
  };

  const contactName = activity?.contact_name || "Contact";

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
            <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(184,149,106,0.05)' }}>
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