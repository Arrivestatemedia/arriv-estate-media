import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";

export default function ChatTab({ currentUserId, currentUserName }) {
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [memberStatuses, setMemberStatuses] = useState({});

  useEffect(() => {
    const loadData = async () => {
      const profiles = {};
      const statuses = {};
      
      // Load SalesTeamMembers
      const members = await base44.entities.SalesTeamMember.list().catch(() => []);
      members?.forEach(m => {
        if (m.profile_picture_url) profiles[m.id] = m.profile_picture_url;
        statuses[m.id] = m.chat_status || "offline";
      });
      
      // Load admin statuses via backend function
      try {
        const response = await base44.functions.invoke('getAdminUsers');
        response?.data?.admins?.forEach(u => {
          statuses[u.id] = u.chat_status || "offline";
        });
      } catch (error) {
        console.error('Failed to load admin users:', error);
      }
      
      setMemberProfiles(profiles);
      setMemberStatuses(statuses);
    };
    
    loadData();

    // Subscribe to real-time status updates for SalesTeamMembers
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

    // Subscribe to User entity updates for admins
    const userUnsub = base44.entities.User.subscribe((event) => {
      if (event.type === "update" && event.data?.chat_status) {
        setMemberStatuses(prev => ({ ...prev, [event.id]: event.data.chat_status }));
      }
    });

    return () => {
      unsub();
      userUnsub?.();
    };
  }, [currentUserId]);

  const handleSelectChat = (type, id, name) => {
    setSelectedChat({ type, id, name });
  };

  const handleStatusChange = (newStatus) => {
    setMemberStatuses(prev => ({ ...prev, [currentUserId]: newStatus }));
  };

  return (
    <div className="flex h-full bg-gray-50">
      <ChatSidebar
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onSelectChat={handleSelectChat}
        memberStatuses={memberStatuses}
        onStatusChange={handleStatusChange}
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