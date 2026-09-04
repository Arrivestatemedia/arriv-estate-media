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

  // Panel: cream/gold transparent backdrop. Bottom-right corner opens at the center of the bubble.
  const panelWidth = Math.min(700, window.innerWidth - 16);
  const panelHeight = 560;
  const bubbleSize = 56;
  const panelMargin = 8;
  const bubbleX = window.innerWidth - bubbleSize - 16;
  const bubbleY = window.innerHeight - bubbleSize - 16;
  let panelLeft = bubbleX + bubbleSize / 2 - panelWidth;
  let panelTop = bubbleY + bubbleSize / 2 - panelHeight;
  panelLeft = Math.max(panelMargin, Math.min(panelLeft, window.innerWidth - panelWidth - panelMargin));
  panelTop = Math.max(panelMargin, Math.min(panelTop, window.innerHeight - panelHeight - panelMargin));

  const panelStyle = {
    height: `${panelHeight}px`,
    width: `${panelWidth}px`,
    maxWidth: '95vw',
    background: 'rgba(255, 251, 245, 0.88)',
    border: '1px solid rgba(184, 149, 106, 0.3)',
    zIndex: 9000,
    left: `${panelLeft}px`,
    top: `${panelTop}px`,
    transform: (isInLiveCall || localRemoteCallLive) ? 'translateY(700px)' : 'translateY(0)',
    opacity: (isInLiveCall || localRemoteCallLive) ? 0 : 1,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
  };

  return (
    <div>
      {/* Floating Chat Panel — Arriv One Connect */}
      {open && (
        <div
          className="fixed rounded-xl shadow-2xl overflow-hidden relative"
          style={panelStyle}
        >
          {/* Close button — floats above the Connect badge bar */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-[#B8956A]/20 hover:bg-[#B8956A]/40 text-[#2a3536] flex items-center justify-center transition-colors"
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