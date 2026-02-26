import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";

const STATUSES = [
  { value: "online",     label: "Online",      color: "#22c55e" },
  { value: "available",  label: "Available",   color: "#22c55e" },
  { value: "busy",       label: "Busy",        color: "#ef4444" },
  { value: "in_meeting", label: "In a Meeting",color: "#f97316" },
  { value: "away",       label: "Away",        color: "#eab308" },
  { value: "lunch",      label: "Lunch",       color: "#a855f7" },
  { value: "break",      label: "Break",       color: "#3b82f6" },
  { value: "offline",    label: "Offline",     color: "#6b7280" },
];

const statusFor = (val) => STATUSES.find(s => s.value === val) || STATUSES[0];

export default function ChatMemberProfile({ member, open, onClose }) {
  if (!member) return null;

  const status = statusFor(member.status);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1A1A1A] border border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white">{member.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gray-800 rounded-lg">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: status.color }}>
              <span className="text-white font-bold text-sm">{member.name.charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{member.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: status.color, display: 'inline-block' }} />
                <span className="text-xs text-gray-300">{status.label}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}