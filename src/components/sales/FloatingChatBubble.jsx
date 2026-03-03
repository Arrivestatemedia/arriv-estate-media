import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "./ChatTab";
import { useCallStatus } from "@/components/CallStatusContext";

export default function FloatingChatBubble({ currentUserId, currentUserName, onInitiateTransfer, onVideoCallStarted, isVideoCallActive, onOpenChat, disabled, isInLiveCall, activeVideoCall, isVideoWindowOpen }) {
  const { isInLiveCall: contextIsInLiveCall, remoteCallLive } = useCallStatus();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [localRemoteCallLive, setLocalRemoteCallLive] = useState(localStorage.getItem('remoteCallLive') === 'true');

  // Resolve from localStorage immediately so we don't wait for async prop
  const userId = currentUserId || localStorage.getItem('sales_member_id');
  const userName = currentUserName || localStorage.getItem('sales_member_name');

  const handleToggleChat = () => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    setOpen(!open);
    if (!open) setUnreadCount(0);
  };

  useEffect(() => {
    // Listen for remoteCallLive changes
    const interval = setInterval(() => {
      const isLive = localStorage.getItem('remoteCallLive') === 'true';
      setLocalRemoteCallLive(isLive);
    }, 100);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const loadUnread = async () => {
      try {
        const msgs = await base44.entities.DirectMessage.filter({
          recipient_id: userId,
          read: false
        });
        setUnreadCount(msgs?.length || 0);
      } catch (_) {}
    };

    loadUnread();

    const unsubscribe = base44.entities.DirectMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.recipient_id === userId) {
        setUnreadCount(prev => prev + 1);
      }
      if (event.type === "update" && event.data?.recipient_id === userId && event.data?.read) {
        loadUnread();
      }
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When opened, don't show badge
  const displayCount = open ? 0 : unreadCount;

  // Standard floating chat bubble (chat panel opens when clicked)
  return (
    <div>
      {/* Floating Chat Panel */}
      {open && (
         <div
          className="fixed w-[700px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden transition-all"
          style={{ height: '520px', backgroundColor: '#fff', borderColor: 'rgba(184,149,106,0.3)', zIndex: 9000, bottom: (isInLiveCall || localRemoteCallLive) ? '-600px' : '5rem', right: '1rem' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(184,149,106,0.2)' }}>
            <span className="text-sm font-semibold text-white">Team Chat</span>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div style={{ height: 'calc(100% - 40px)' }}>
            <ChatTab 
              currentUserId={userId} 
              currentUserName={userName}
              onInitiateTransfer={onInitiateTransfer}
              onVideoCallStarted={onVideoCallStarted}
            />
          </div>
        </div>
      )}

      {/* Bubble Button */}
      <button
        onClick={handleToggleChat}
        className="fixed w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105"
        style={{ bottom: (isInLiveCall || localRemoteCallLive) ? '-500px' : '1rem', right: '1rem', zIndex: 9000, backgroundColor: '#B8956A', opacity: (disabled || isInLiveCall || isVideoWindowOpen) ? 0.5 : 1, pointerEvents: (disabled || isInLiveCall || isVideoWindowOpen) ? 'none' : 'auto', cursor: (disabled || isInLiveCall || isVideoWindowOpen) ? 'not-allowed' : 'pointer' }}
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
    </div>
  );
}