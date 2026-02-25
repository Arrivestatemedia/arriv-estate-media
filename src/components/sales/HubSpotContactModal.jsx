import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HubSpotContactModal({ email, open, onOpenChange }) {
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && email) {
      setLoading(true);
      base44.functions.invoke('getHubSpotContact', { email })
        .then(res => {
          setContact(res.data?.contact);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  }, [open, email]);

  if (!contact && loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!contact) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact Information</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">No contact information found for {email}</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{contact.firstname} {contact.lastname}</span>
            {contact.hubspotUrl && (
              <a href={contact.hubspotUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 text-[#B8956A] hover:text-[#A68559]" />
              </a>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {contact.email && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Email</p>
              <p className="text-sm text-gray-900 break-all">{contact.email}</p>
            </div>
          )}
          
          {contact.phone && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Phone</p>
              <p className="text-sm text-gray-900">{contact.phone}</p>
            </div>
          )}
          
          {contact.company && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Company</p>
              <p className="text-sm text-gray-900">{contact.company}</p>
            </div>
          )}
          
          {contact.lifecyclestage && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Lifecycle Stage</p>
              <p className="text-sm text-gray-900 capitalize">{contact.lifecyclestage?.replace('_', ' ')}</p>
            </div>
          )}
          
          {contact.leadstatus && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Lead Status</p>
              <p className="text-sm text-gray-900 capitalize">{contact.leadstatus?.replace('_', ' ')}</p>
            </div>
          )}
          
          {contact.address && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Address</p>
              <p className="text-sm text-gray-900">
                {contact.address}
                {contact.city && `, ${contact.city}`}
                {contact.state && `, ${contact.state}`}
                {contact.zip && ` ${contact.zip}`}
              </p>
            </div>
          )}
          
          {contact.notes && (
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Notes</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}