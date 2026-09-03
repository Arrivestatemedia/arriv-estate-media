import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "@/components/sales/ChatTab";
import { useCallStatus } from "@/components/CallStatusContext";

export default function AdminChatBubble({ currentUserId, currentUserName, onInitiateTransfer, onVideoCallStarted, isVideoCallActive, disabled, isInLiveCall, activeVideoCall, isVideoWindowOpen }) {
  const { isInLiveCall: contextIsInLiveCall, remoteCallLive } = useCallStatus();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [localRemoteCallLive, setLocalRemoteCallLive] = useState(localStorage.getItem('remoteCallLive') === 'true');

  const handleToggleChat = () => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    setOpen(!open);
    if (!open) setUnreadCount(0);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const isLive = localStorage.getItem('remoteCallLive') === 'true';
      setLocalRemoteCallLive(isLive);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const userId = currentUserId || localStorage.getItem('sales_member_id');
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

  const displayCount = open ? 0 : unreadCount;

  // Panel: gradient backdrop so glassmorphism surfaces have something to blur.
  // Connect badge is inside ChatTab; close button floats top-right.
  const panelStyle = {
    height: '560px',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 30%, #ec4899 65%, #f59e0b 100%)',
    border: '1px solid rgba(255,255,255,0.3)',
    zIndex: 9000,
    bottom: (isInLiveCall || localRemoteCallLive) ? '-600px' : '5rem',
    right: '1rem',
  };

  return (
    <div>
      {/* Floating Chat Panel — Arriv One Connect */}
      {open && (
        <div
          className="fixed w-[700px] max-w-[95vw] rounded-xl shadow-2xl overflow-hidden relative"
          style={panelStyle}
        >
          {/* Close button — floats above the Connect badge bar */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
          {/* ChatTab fills the panel — it carries the Connect badge + data-connect-chat theming */}
          <div className="h-full">
            <ChatTab
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isAdmin={true}
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
        style={{
          bottom: (isInLiveCall || localRemoteCallLive) ? '-500px' : '1rem',
          right: '1rem',
          zIndex: 9000,
          backgroundColor: '#B8956A',
          opacity: (disabled || isInLiveCall || isVideoWindowOpen) ? 0.5 : 1,
          pointerEvents: (disabled || isInLiveCall || isVideoWindowOpen) ? 'none' : 'auto',
          cursor: (disabled || isInLiveCall || isVideoWindowOpen) ? 'not-allowed' : 'pointer',
        }}
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