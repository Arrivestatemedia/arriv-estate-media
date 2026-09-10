import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";
import { ArrivOneConnectBadge } from "@/components/chat/ArrivOneConnectBadge";
import "@/components/chat/connectChat.css";

export default function ChatTab({ currentUserId, currentUserName, salesMemberId, isAdmin, onInitiateTransfer, onVideoCallStarted, onVideoCallEnded }) {
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [memberStatuses, setMemberStatuses] = useState({});
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const syncIntervalRef = React.useRef(null);

  // Resolve current user's email for cross-app chat (sales session or Base44 auth)
  useEffect(() => {
    const sessionEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    if (sessionEmail) {
      setCurrentUserEmail(sessionEmail);
    } else {
      base44.auth.me().then(user => {
        if (user?.email) setCurrentUserEmail(user.email);
      }).catch(() => {});
    }
  }, []);

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
    // Use backend function to bypass RLS — sales-authenticated users can
    // only read their own SalesTeamMember record via the SDK, so profile
    // pictures and chat statuses for other members would be missing.
    base44.functions.invoke('listAllSalesTeamMembers').then(res => {
      const data = res?.data || res;
      const members = data?.members || [];
      const profiles = {};
      const statuses = {};
      members?.forEach(m => {
        if (m.profile_picture_url) profiles[m.id] = m.profile_picture_url;
        statuses[m.id] = m.chat_status || "offline";
      });
      setMemberProfiles(profiles);
      setMemberStatuses(statuses);
    }).catch(() => {});

    // Subscribe to real-time status updates
    let unsub = () => {};
    try {
      unsub = base44.entities.SalesTeamMember.subscribe((event) => {
        if (event.type === "update") {
          if (event.data?.chat_status) {
            setMemberStatuses(prev => ({ ...prev, [event.id]: event.data.chat_status }));
          }
          if (event.data?.profile_picture_url) {
            setMemberProfiles(prev => ({ ...prev, [event.id]: event.data.profile_picture_url }));
          }
        }
      });
    } catch (e) {
      console.error('[ChatTab] SalesTeamMember subscribe failed:', e);
    }
    return unsub;
  }, []);

  const handleSelectChat = (type, id, name) => {
    setSelectedChat({ type, id, name });
  };

  return (
    <div className="flex flex-col h-full relative" data-connect-chat="estate_media">
      {/* Background orbs — glassmorphism needs a colorful backdrop to blur */}
      <div className="connect-bg-orbs">
        <div className="connect-bg-orb" style={{ width: 300, height: 300, top: -60, left: -60, backgroundColor: "#B8956A" }} />
        <div className="connect-bg-orb" style={{ width: 250, height: 250, bottom: -40, right: -40, backgroundColor: "#D4B896" }} />
        <div className="connect-bg-orb" style={{ width: 200, height: 200, top: "30%", left: "40%", backgroundColor: "#E8D5B8" }} />
      </div>

      {/* Connect product identity badge bar */}
      <div className="relative z-10 glass-header px-4 py-2 flex items-center">
        <ArrivOneConnectBadge />
      </div>

      {/* Chat shell — sidebar + chat pane */}
      <div className="flex flex-1 relative z-10 min-h-0">
        {/* Sidebar — full width on mobile when no chat selected, 288px on desktop */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-72`}>
          <ChatSidebar
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserEmail={currentUserEmail}
            onSelectChat={handleSelectChat}
            memberStatuses={memberStatuses}
          />
        </div>
        {/* Chat pane — hidden on mobile until a conversation is selected */}
        <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
          {selectedChat ? (
            <>
              {/* Mobile back button — glass-header bar */}
              <div className="flex items-center gap-2 px-3 py-2 glass-header md:hidden">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="text-slate-700 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <span className="text-slate-800 text-sm font-medium truncate">{selectedChat.name}</span>
              </div>
              <ChatWindow
                chatType={selectedChat.type}
                chatId={selectedChat.id}
                chatName={selectedChat.name}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserEmail={currentUserEmail}
                memberProfiles={memberProfiles}
                memberStatuses={memberStatuses}
                onInitiateTransfer={onInitiateTransfer}
                onVideoCallStarted={onVideoCallStarted}
                onVideoCallEnded={onVideoCallEnded}
              />
            </>
          ) : (
            <div className="hidden md:flex items-center justify-center h-full text-slate-400 text-sm">
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>
    </div>
  );
}