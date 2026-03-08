import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, User, Building2, Phone, Mail, FileText, Timer, Image, Trash2, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CallMapModal from "./CallMapModal";

export default function ActivityDetailModal({ activity, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [showCallMap, setShowCallMap] = useState(false);
  
  if (!activity) return null;

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this activity?')) return;
    setDeleting(true);
    try {
      await base44.entities.ActivityLog.delete(activity.id);
      await new Promise(resolve => setTimeout(resolve, 500)); // Allow DB to sync
      onDelete?.(activity.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete activity:', err);
      alert('Failed to delete activity');
    } finally {
      setDeleting(false);
    }
  };

  const typeColors = {
    call: "bg-blue-100 text-blue-800",
    email: "bg-green-100 text-green-800",
    meeting: "bg-purple-100 text-purple-800",
  };

  const date = new Date(activity.activity_date);

  return (
    <Dialog open={!!activity} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Badge className={typeColors[activity.activity_type] || "bg-gray-100 text-gray-800"}>
                {activity.activity_type}
              </Badge>
              <span className="text-sm font-normal text-gray-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-3 pt-1">
           {/* Contact Info */}
           <div className="bg-slate-50 rounded-lg p-2.5 space-y-1 text-xs">
             {activity.contact_name && (
               <div className="flex items-center gap-2 text-gray-700">
                 <User className="w-3 h-3 text-gray-400" />
                 <span className="font-medium">{activity.contact_name}</span>
               </div>
             )}
             {activity.contact_email && (
               <div className="flex items-center gap-2 text-gray-600">
                 <Mail className="w-3 h-3 text-gray-400" />
                 <span className="truncate text-xs">{activity.contact_email}</span>
               </div>
             )}
             {activity.company_name && (
               <div className="flex items-center gap-2 text-gray-600">
                 <Building2 className="w-3 h-3 text-gray-400" />
                 <span className="truncate text-xs">{activity.company_name}</span>
               </div>
             )}
           </div>

          {/* Call Map (if present) */}
          {activity.call_map && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Phone className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>AI Call Map</p>
              </div>
              <Button
                onClick={() => setShowCallMap(true)}
                className="w-full gap-2"
                style={{ backgroundColor: '#B8956A', color: '#fff' }}
                size="sm"
              >
                <Eye className="w-4 h-4" />
                View Full Call Map
              </Button>
            </div>
          )}

          {/* Notes / Content */}
          {activity.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgba(26,26,26,0.5)' }}>Notes</p>
              {(() => {
                const raw = activity.notes?.replace(/HubSpot contact/gi, 'Contact').replace(/HubSpot/gi, '');
                const markerIdx = raw?.indexOf('[Screenshots]\n');
                if (markerIdx !== undefined && markerIdx >= 0) {
                  const notesOnly = raw.slice(0, raw.indexOf('\n\n[Screenshots]')).trim();
                  const screenshotUrls = raw.slice(markerIdx + '[Screenshots]\n'.length).trim().split('\n').filter(Boolean);
                  return (
                    <>
                      <div className="bg-white border rounded p-2 text-xs text-gray-700 leading-relaxed mb-2" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
                        {notesOnly.slice(0, 150)}{notesOnly.length > 150 ? '...' : ''}
                      </div>
                      {screenshotUrls.length > 0 && (
                        <p className="text-xs text-gray-500">+{screenshotUrls.length} attachments</p>
                      )}
                    </>
                  );
                }
                return (
                  <div className="bg-white border rounded p-2 text-xs text-gray-700 leading-relaxed" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
                    {raw.slice(0, 150)}{raw.length > 150 ? '...' : ''}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Follow-ups */}
          {activity._followUps && activity._followUps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'rgba(26,26,26,0.5)' }}>Follow-ups ({activity._followUps.length})</p>
              <div className="space-y-1.5">
                {activity._followUps.map((fu, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge className={typeColors[fu.activity_type] || "bg-gray-100 text-gray-800"} variant="outline" className="text-xs h-5">
                        {fu.activity_type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(fu.activity_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* Call Map Modal */}
          {showCallMap && activity.call_map && (
          <CallMapModal
            contact={{ name: activity.contact_name, phone: activity.contact_phone, email: activity.contact_email }}
            script={activity.call_map}
            onClose={() => setShowCallMap(false)}
          />
          )}
          </DialogContent>
          </Dialog>
          );
          }