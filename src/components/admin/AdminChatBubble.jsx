import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "@/components/sales/ChatTab";

export default function AdminChatBubble({ currentUserId, currentUserName, onInitiateTransfer }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;

    const loadUnread = async () => {
      const msgs = await base44.entities.DirectMessage.filter({
        recipient_id: currentUserId,
        read: false
      });
      setUnreadCount(msgs?.length || 0);
    };

    loadUnread();

    // Subscribe to new DMs
    const unsubscribe = base44.entities.DirectMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.recipient_id === currentUserId) {
        setUnreadCount(prev => prev + 1);
      }
      if (event.type === "update" && event.data?.recipient_id === currentUserId && event.data?.read) {
        loadUnread();
      }
    });

    return unsubscribe;
  }, [currentUserId]);

  // When opened, don't show badge
  const displayCount = open ? 0 : unreadCount;

  return (
    <>
      {/* Floating Chat Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[700px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden"
          style={{ height: '520px', backgroundColor: '#fff', borderColor: 'rgba(184,149,106,0.3)' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(184,149,106,0.2)' }}>
            <span className="text-sm font-semibold text-white">Team Chat</span>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div style={{ height: 'calc(100% - 40px)' }}>
            <ChatTab currentUserId={currentUserId} currentUserName={currentUserName} />
          </div>
        </div>
      )}

      {/* Bubble Button */}
      <button
        onClick={() => { setOpen(!open); if (!open) setUnreadCount(0); }}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        style={{ backgroundColor: '#B8956A' }}
      >
        <MessageSquare className="w-6 h-6 text-white" />
        {displayCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: '#ef4444', minWidth: '1.25rem' }}
          >
            {displayCount > 9 ? '9+' : displayCount}
          </span>
        )}
      </button>
    </>
  );
}