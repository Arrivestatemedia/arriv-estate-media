import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import ChatSidebar from "@/components/sales/ChatSidebar";
import ChatWindow from "@/components/sales/ChatWindow";

export default function AdminChat() {
  const navigate = useNavigate();
  const [adminId, setAdminId] = useState(null);
  const [adminName, setAdminName] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [memberStatuses, setMemberStatuses] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await base44.auth.me();
        if (!user || user.role !== "admin") {
          navigate(createPageUrl("AdminLogin"));
          return;
        }
        
        setAdminId(user.id);
        setAdminName(user.full_name);
        
        // Load sales team member profiles and statuses
        const members = await base44.entities.SalesTeamMember.list();
        const profiles = {};
        const statuses = {};
        members?.forEach(m => {
          if (m.profile_picture_url) profiles[m.id] = m.profile_picture_url;
          statuses[m.id] = m.chat_status || "offline";
        });
        setMemberProfiles(profiles);
        setMemberStatuses(statuses);

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

        setLoading(false);
        return unsub;
      } catch (error) {
        navigate(createPageUrl("AdminLogin"));
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    localStorage.removeItem('admin_id');
    localStorage.removeItem('admin_email');
    localStorage.removeItem('admin_name');
    localStorage.removeItem('user_type');
    await base44.auth.logout(createPageUrl("AdminLogin"));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Admin Chat Monitor</h1>
          <p className="text-sm text-gray-600">{adminName}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="gap-2"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        <ChatSidebar
          currentUserId={adminId}
          currentUserName={adminName}
          onSelectChat={(type, id, name) => setSelectedChat({ type, id, name })}
          memberStatuses={memberStatuses}
        />
        <div className="flex-1">
          {selectedChat ? (
            <ChatWindow
              chatType={selectedChat.type}
              chatId={selectedChat.id}
              chatName={selectedChat.name}
              currentUserId={adminId}
              currentUserName={adminName}
              memberProfiles={memberProfiles}
              memberStatuses={memberStatuses}
              isAdmin={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a channel or conversation to monitor
            </div>
          )}
        </div>
      </div>
    </div>
  );
}