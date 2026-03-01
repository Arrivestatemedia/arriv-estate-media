import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "./ChatTab";

export default function FloatingChatBubble({ currentUserId, currentUserName, onInitiateTransfer, isVideoActive, onOpenChat }) {
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

  const handleClick = () => {
    setUnreadCount(0);
    onOpenChat?.();
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105"
      style={{ [isVideoActive ? 'right' : 'left']: '1rem', zIndex: 250, backgroundColor: '#B8956A' }}
      title="Open chat"
    >
      <MessageSquare className="w-6 h-6 text-white" />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: '#ef4444', minWidth: '1.25rem' }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}