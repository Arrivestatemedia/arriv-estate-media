import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";

export default function ChatTab({ currentUserId, currentUserName, salesMemberId, isAdmin, onInitiateTransfer }) {
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [memberStatuses, setMemberStatuses] = useState({});
  const syncIntervalRef = React.useRef(null);

  // Auto-sync chat status with Google Calendar every 1 minute
  useEffect(() => {
    if (!currentUserId) return;

    const syncStatus = async () => {
      try {
        if (isAdmin) {
          await base44.functions.invoke('syncAdminChatStatusWithCalendar', {});
        } else if (salesMemberId) {
          await base44.functions.invoke('syncChatStatusWithCalendar', { salesMemberId });
        }
      } catch (err) {
        console.error('Calendar sync error:', err);
      }
    };

    syncStatus();
    syncIntervalRef.current = setInterval(syncStatus, 1 * 60 * 1000);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [currentUserId, salesMemberId, isAdmin]);

  useEffect(() => {
    base44.entities.SalesTeamMember.list().then(members => {
      const profiles = {};
      const statuses = {};
      members?.forEach(m => {
        if (m.profile_picture_url) profiles[m.id] = m.profile_picture_url;
        statuses[m.id] = m.chat_status || "offline";
      });
      setMemberProfiles(profiles);
      setMemberStatuses(statuses);
    });

    // Subscribe to real-time status updates
    const unsub = base44.entities.SalesTeamMember.subscribe((event) => {
      if (event.type === "update") {
        if (event.data?.chat_status) {
          setMemberStatuses(prev => ({ ...prev, [event.id]: event.data.chat_status }));
        }
        if (event.data?.profile_picture_url) {
          setMemberProfiles(prev => ({ ...prev, [event.id]: event.data.profile_picture_url }));
        }
      }
    });
    return unsub;
  }, []);

  const handleSelectChat = (type, id, name) => {
    setSelectedChat({ type, id, name });
  };

  return (
    <div className="flex h-full bg-gray-50">
      <ChatSidebar
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onSelectChat={handleSelectChat}
        memberStatuses={memberStatuses}
      />
      <div className="flex-1">
        {selectedChat ? (
          <ChatWindow
            chatType={selectedChat.type}
            chatId={selectedChat.id}
            chatName={selectedChat.name}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            memberProfiles={memberProfiles}
            memberStatuses={memberStatuses}
            onInitiateTransfer={onInitiateTransfer}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a channel or conversation to start
          </div>
        )}
      </div>
    </div>
  );
}