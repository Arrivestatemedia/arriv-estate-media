import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "./ChatTab";

export default function FloatingChatBubble({ currentUserId, currentUserName, onInitiateTransfer, isVideoCallActive, onOpenChat }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isVideoActive, setIsVideoActive] = useState(false);

  // Resolve from localStorage immediately so we don't wait for async prop
  const userId = currentUserId || localStorage.getItem('sales_member_id');
  const userName = currentUserName || localStorage.getItem('sales_member_name');

  const handleToggleChat = () => {
    setOpen(!open);
    if (!open) setUnreadCount(0);
  };

  // Listen for video call events
  useEffect(() => {
    console.log('[FloatingChatBubble] Setting up video call event listeners');
    
    const handleVideoStart = () => {
      console.log('[FloatingChatBubble] videoCallStarted event received');
      setIsVideoActive(true);
      setOpen(false);
    };

    const handleVideoEnd = () => {
      console.log('[FloatingChatBubble] videoCallEnded event received');
      setIsVideoActive(false);
    };

    const handleVideoMinimized = () => {
      console.log('[FloatingChatBubble] videoCallMinimized event received');
      setIsVideoActive(false);
    };

    const handleVideoRestored = () => {
      console.log('[FloatingChatBubble] videoCallRestored event received');
      setIsVideoActive(true);
      setOpen(false);
    };

    window.addEventListener('videoCallStarted', handleVideoStart);
    window.addEventListener('videoCallEnded', handleVideoEnd);
    window.addEventListener('videoCallMinimized', handleVideoMinimized);
    window.addEventListener('videoCallRestored', handleVideoRestored);

    return () => {
      window.removeEventListener('videoCallStarted', handleVideoStart);
      window.removeEventListener('videoCallEnded', handleVideoEnd);
      window.removeEventListener('videoCallMinimized', handleVideoMinimized);
      window.removeEventListener('videoCallRestored', handleVideoRestored);
    };
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

  // Don't render if video call is active
  if (isVideoActive) return null;

  // Standard floating chat bubble (chat panel opens when clicked)
  return (
    <div>
      {/* Floating Chat Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 w-[700px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden"
          style={{ height: '520px', backgroundColor: '#fff', borderColor: 'rgba(184,149,106,0.3)', zIndex: 1000 }}
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
            />
          </div>
        </div>
      )}

      {/* Bubble Button */}
      <button
        onClick={handleToggleChat}
        className="fixed bottom-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105"
        style={{ right: '1rem', zIndex: 1000, backgroundColor: '#B8956A' }}
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