import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mail, Phone, Smartphone, Briefcase, User, Hash, Video } from "lucide-react";
import VideoCallPanel from "@/components/sales/VideoCallPanel";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const STATUS_LABELS = {
  online: "Online",
  available: "Available",
  busy: "Busy",
  in_meeting: "In a Meeting",
  away: "Away",
  lunch: "Lunch",
  break: "Break",
  offline: "Offline"
};

const STATUS_COLORS = {
  online: "#22c55e", available: "#22c55e", busy: "#ef4444",
  in_meeting: "#f97316", away: "#eab308", lunch: "#a855f7",
  break: "#3b82f6", offline: "#6b7280"
};

export default function SalesRepProfileModal({ memberId, open, onClose, onCallClick, onVideoClick }) {
  const [member, setMember] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showVideoCall, setShowVideoCall] = useState(false);

  useEffect(() => {
    if (!open || !memberId) return;

    const load = async () => {
      setLoading(true);
      const [members, acts] = await Promise.all([
        base44.entities.SalesTeamMember.filter({ id: memberId }),
        base44.entities.ActivityLog.filter({ sales_member_id: memberId }, "-activity_date", 50)
      ]);
      setMember(members?.[0] || null);
      setActivities(acts || []);
      setLoading(false);
    };

    load();
  }, [memberId, open]);

  // Group activities by contact
  const contactMap = {};
  activities.forEach(a => {
    const key = a.contact_email || a.contact_name;
    if (!key) return;
    if (!contactMap[key]) {
      contactMap[key] = {
        name: a.contact_name,
        email: a.contact_email,
        company: a.company_name,
        count: 0,
        lastDate: a.activity_date
      };
    }
    contactMap[key].count++;
    if (new Date(a.activity_date) > new Date(contactMap[key].lastDate)) {
      contactMap[key].lastDate = a.activity_date;
    }
  });

  const contacts = Object.values(contactMap).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Team Member Profile</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-gray-500 text-sm">Loading...</div>
        ) : !member ? (
          <div className="py-8 text-center text-gray-500 text-sm">Profile not found.</div>
        ) : (
          <div className="space-y-5">
            {/* Avatar + Name + Title */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-[#B8956A]/20 flex items-center justify-center flex-shrink-0">
                {member.profile_picture_url ? (
                  <img src={member.profile_picture_url} alt={member.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-[#B8956A]">{(member.full_name || "?")[0].toUpperCase()}</span>
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{member.full_name}</h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span 
                    className="w-2 h-2 rounded-full" 
                    style={{ backgroundColor: STATUS_COLORS[member.chat_status || 'offline'] || '#6b7280' }}
                  />
                  <p className="text-xs text-gray-500">
                    {STATUS_LABELS[member.chat_status || 'offline']}
                  </p>
                </div>
                {member.title && (
                  <p className="text-sm text-[#B8956A] flex items-center gap-1 mt-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    {member.title}
                  </p>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2.5">
              {member.company_email && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Mail className="w-4 h-4 text-[#B8956A] flex-shrink-0" />
                  <a href={`mailto:${member.company_email}`} className="hover:underline">{member.company_email}</a>
                </div>
              )}
              {member.work_phone && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Phone className="w-4 h-4 text-[#B8956A] flex-shrink-0" />
                  <span className="text-xs text-gray-500 mr-1">Work:</span>
                  <a href={`tel:${member.work_phone}`} className="hover:underline">{member.work_phone}</a>
                </div>
              )}
              {member.phone_number && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Smartphone className="w-4 h-4 text-[#B8956A] flex-shrink-0" />
                  <span className="text-xs text-gray-500 mr-1">Cell:</span>
                  <a href={`tel:${member.phone_number}`} className="hover:underline">{member.phone_number}</a>
                </div>
              )}
              {member.extension && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Hash className="w-4 h-4 text-[#B8956A] flex-shrink-0" />
                    <span className="text-xs text-gray-500 mr-1">Extension:</span>
                    <span className="font-mono font-semibold">{member.extension}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCallClick?.(member.id, member.full_name, false);
                      }}
                      className="h-7 px-2 gap-1"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCallClick?.(member.id, member.full_name, true);
                      }}
                      className="h-7 px-2 gap-1"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Video
                    </Button>
                  </div>
                </div>
              )}
              {!member.company_email && !member.work_phone && !member.phone_number && !member.extension && (
                <p className="text-xs text-gray-400">No contact info on file.</p>
              )}
            </div>

            {/* Leads / Clients Summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <User className="w-4 h-4 text-[#B8956A]" />
                Leads & Clients ({contacts.length})
              </h3>
              {contacts.length === 0 ? (
                <p className="text-xs text-gray-400">No activity logged yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-[#B8956A]/10 transition-colors cursor-default">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name || c.email}</p>
                        {c.company && <p className="text-xs text-gray-500">{c.company}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#B8956A] font-medium">{c.count} activity{c.count !== 1 ? 's' : ''}</p>
                        <p className="text-xs text-gray-400">{formatDistanceToNow(new Date(c.lastDate), { addSuffix: true })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}