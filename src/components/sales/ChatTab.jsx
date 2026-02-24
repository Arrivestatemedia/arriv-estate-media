import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";

export default function ChatTab({ currentUserId, currentUserName }) {
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});

  useEffect(() => {
    base44.entities.SalesTeamMember.list().then(members => {
      const profiles = {};
      members?.forEach(m => {
        if (m.profile_picture_url) profiles[m.id] = m.profile_picture_url;
      });
      setMemberProfiles(profiles);
    });
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