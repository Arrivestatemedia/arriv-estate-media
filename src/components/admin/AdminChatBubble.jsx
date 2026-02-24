import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminChatWindow from "./AdminChatWindow";

export default function AdminChatBubble({ currentUserId, currentUserName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Load unread direct messages for this admin
    base44.entities.DirectMessage.filter({ 
      recipient_id: currentUserId, 
      read: false 
    }).then(messages => {
      setUnreadCount(messages?.length || 0);
    }).catch(() => {});

    // Subscribe to new unread messages
    const dmSub = base44.entities.DirectMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.recipient_id === currentUserId && !event.data?.read) {
        setUnreadCount(prev => prev + 1);
      } else if (event.type === "update" && event.data?.recipient_id === currentUserId && event.data?.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    });
    return dmSub;
  }, [currentUserId]);

  return (
    <>
      {/* Floating chat bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-40"
          style={{ backgroundColor: '#B8956A', color: '#FFFBF5' }}
        >
          <div className="relative">
            <MessageSquare className="w-6 h-6" />
            {unreadCount > 0 && (
              <span
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                style={{ backgroundColor: '#1A1A1A', color: '#FFFBF5' }}
              >
                {unreadCount}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Chat window - expands from bubble */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-xl shadow-2xl flex flex-col z-50 border border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b" style={{ backgroundColor: '#B8956A' }}>
            <div>
              <h3 className="font-semibold text-white">Admin Chat</h3>
              <p className="text-xs text-gray-100">Chat with your team</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Chat content */}
          <AdminChatWindow currentUserId={currentUserId} currentUserName={currentUserName} />
        </div>
      )}
    </>
  );
}