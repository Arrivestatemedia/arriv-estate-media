import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, X } from "lucide-react";
import ChatTab from "./ChatTab";

export default function AdminChatBubble({ currentUserId, currentUserName }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {isOpen ? (
        <div 
          className="bg-white rounded-lg shadow-2xl border border-gray-200"
          style={{ width: '400px', height: '600px' }}
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Messages</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-hidden" style={{ height: 'calc(100% - 56px)' }}>
            <ChatTab currentUserId={currentUserId} currentUserName={currentUserName} />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 rounded-full bg-[#B8956A] hover:bg-[#A68559] text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}