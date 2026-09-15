import React from "react";
import { Video, X } from "lucide-react";

// Floating banner shown in the top-right when a cross-app video call
// invitation message arrives. Matches the toast-card style from the
// Arriv One screenshot: white card, rounded corners, soft shadow.
// Clicking it opens the chat panel and navigates to the sender's DM.
export default function VideoCallNotificationBanner({ notification, onOpenChat, onDismiss }) {
  if (!notification) return null;
  const { senderName, senderRole, message } = notification;

  return (
    <div
      onClick={() => { onOpenChat(); onDismiss(); }}
      className="fixed top-4 right-4 z-[9100] cursor-pointer animate-in slide-in-from-right duration-300"
    >
      <div className="bg-white rounded-lg shadow-xl border border-slate-200 w-80 overflow-hidden hover:shadow-2xl transition-shadow">
        {/* Accent bar */}
        <div className="h-1 bg-[#B8956A]" />
        <div className="p-3.5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#B8956A] flex items-center justify-center flex-shrink-0">
                <Video className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-900 leading-tight">{senderName || "Unknown"}</p>
                <p className="text-xs text-slate-400 leading-tight">{senderRole || "Arriv One"}</p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="text-slate-300 hover:text-slate-500 transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-slate-700 leading-snug line-clamp-2">{message}</p>
          <p className="text-xs text-[#B8956A] mt-2 font-medium">Click to open chat →</p>
        </div>
      </div>
    </div>
  );
}