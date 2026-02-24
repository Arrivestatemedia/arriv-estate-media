import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";

export default function ChatTab({ currentUserId, currentUserName }) {
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [memberStatuses, setMemberStatuses] = useState({});

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
      
      // If current user is not in SalesTeamMember, load from User entity
      if (!members?.find(m => m.id === currentUserId)) {
        base44.auth.me().then(user => {
          if (user) {
            setMemberStatuses(prev => ({ ...prev, [currentUserId]: user.chat_status || "offline" }));
          }
        }).catch(() => {});
      }
    }).catch(() => {});

    // Subscribe to real-time status updates for ALL team members (including current user)
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

    // Subscribe to User entity updates for admins/non-sales-reps
    const userUnsub = base44.entities.User?.subscribe?.((event) => {
      if (event.type === "update") {
        if (event.data?.chat_status) {
          setMemberStatuses(prev => ({ ...prev, [event.id]: event.data.chat_status }));
        }
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