import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Building2, Phone, Mail, FileText, Timer } from "lucide-react";

export default function ActivityDetailModal({ activity, onClose }) {
  if (!activity) return null;

  const typeColors = {
    call: "bg-blue-100 text-blue-800",
    email: "bg-green-100 text-green-800",
    meeting: "bg-purple-100 text-purple-800",
  };

  const date = new Date(activity.activity_date);

  return (
    <Dialog open={!!activity} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={typeColors[activity.activity_type] || "bg-gray-100 text-gray-800"}>
              {activity.activity_type}
            </Badge>
            <span className="text-sm font-normal text-gray-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Contact Info */}
          <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 text-sm">
            {activity.contact_name && (
              <div className="flex items-center gap-2 text-gray-700">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium">{activity.contact_name}</span>
              </div>
            )}
            {activity.contact_email && (
              <div className="flex items-center gap-2 text-gray-700">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                {activity.contact_email}
              </div>
            )}
            {activity.company_name && (
              <div className="flex items-center gap-2 text-gray-700">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                {activity.company_name}
              </div>
            )}
            {activity.sales_member_email && (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <User className="w-3 h-3" />
                Rep: {activity.sales_member_email}
              </div>
            )}
            {activity.duration_minutes > 0 && (
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <Timer className="w-3 h-3" />
                Duration: {activity.duration_minutes} min
              </div>
            )}
          </div>

          {/* Notes / Content */}
          {activity.notes && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Notes / Content</p>
              </div>
              <div className="bg-white border rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
                {activity.notes}
              </div>
            </div>
          )}

          {/* Follow-ups (upcoming activities linked to same contact) */}
          {activity._followUps && activity._followUps.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.5)' }}>Follow-ups ({activity._followUps.length})</p>
              </div>
              <div className="space-y-2">
                {activity._followUps.map((fu, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <Badge className={typeColors[fu.activity_type] || "bg-gray-100 text-gray-800"} variant="outline">
                        {fu.activity_type}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(fu.activity_date).toLocaleDateString()} {new Date(fu.activity_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {fu.notes && <p className="text-gray-700 text-xs">{fu.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}