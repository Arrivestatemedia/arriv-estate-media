import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Phone, Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

export default function ViewCallMapModal({ activity, open, onOpenChange }) {
  const [callMap, setCallMap] = useState(activity?.call_map || "");
  const [regenerating, setRegenerating] = useState(false);

  const regenerateCallMap = async () => {
    setRegenerating(true);
    try {
      // Call backend function to regenerate call map with full context
      const res = await base44.functions.invoke('regenerateCallMap', {
        activityId: activity.id,
        contactName: activity.contact_name,
        contactEmail: activity.contact_email,
        companyName: activity.company_name,
      });
      
      const newCallMap = res.data?.call_map || "";
      setCallMap(newCallMap);
      
      // Update the activity with new call map
      await base44.entities.ActivityLog.update(activity.id, { call_map: newCallMap });
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(false);
    }
  };

  const contactName = activity?.contact_name || "Contact";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Call Map — {contactName}
          </DialogTitle>
          <DialogClose />
        </DialogHeader>

        <div className="space-y-4">
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-2">
              <Phone className="w-4 h-4" />
              Call
            </Button>
            <Button size="sm" variant="outline" className="gap-2">
              <Mail className="w-4 h-4" />
              Email
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={regenerateCallMap}
              disabled={regenerating}
              className="gap-2 ml-auto"
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate Call Map
            </Button>
          </div>

          {/* Call map content */}
          {callMap ? (
            <div className="prose prose-sm max-w-none bg-slate-50 rounded-lg p-4">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-3">{children}</p>,
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold mt-4 mb-2 flex items-center gap-2">
                      {children}
                    </h3>
                  ),
                  ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {callMap}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">
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