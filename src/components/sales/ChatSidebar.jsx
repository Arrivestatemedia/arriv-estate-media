import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Hash, MessageSquare, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUSES = [
  { value: "online",     label: "Online",      color: "#22c55e" },
  { value: "available",  label: "Available",   color: "#22c55e" },
  { value: "busy",       label: "Busy",        color: "#ef4444" },
  { value: "in_meeting", label: "In a Meeting",color: "#f97316" },
  { value: "away",       label: "Away",        color: "#eab308" },
  { value: "lunch",      label: "Lunch",       color: "#a855f7" },
  { value: "break",      label: "Break",       color: "#3b82f6" },
  { value: "offline",    label: "Offline",     color: "#6b7280" },
];

const statusFor = (val) => STATUSES.find(s => s.value === val) || STATUSES[0];

function StatusDot({ value, size = 10 }) {
  const s = statusFor(value);
  return <span style={{ width: size, height: size, borderRadius: '50%', backgroundColor: s.color, display: 'inline-block', flexShrink: 0 }} />;
}

export default function ChatSidebar({ currentUserId, currentUserName, onSelectChat }) {
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  useEffect(() => {
    loadChannels();
    loadDirectMessages();
    loadTeamMembers();
  }, [currentUserId]);

  const loadChannels = async () => {
    const allChannels = await base44.entities.ChatChannel.list();
    setChannels(allChannels || []);
  };

  const loadDirectMessages = async () => {
    const dms = await base44.entities.DirectMessage.filter({
      $or: [{ sender_id: currentUserId }, { recipient_id: currentUserId }]
    });
    
    // Get unique conversations
    const conversations = {};
    dms?.forEach(dm => {
      const otherId = dm.sender_id === currentUserId ? dm.recipient_id : dm.sender_id;
      const otherName = dm.sender_id === currentUserId ? dm.recipient_name : dm.sender_name;
      if (!conversations[otherId]) {
        conversations[otherId] = { id: otherId, name: otherName };
      }
    });
    setDirectMessages(Object.values(conversations));
  };

  const loadTeamMembers = async () => {
    const members = await base44.entities.SalesTeamMember.list();
    setTeamMembers(members?.filter(m => m.id !== currentUserId) || []);
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;

    await base44.entities.ChatChannel.create({
      name: newChannelName,
      created_by: currentUserId,
      members: [currentUserId]
    });

    setNewChannelName("");
    setOpenDialog(false);
    loadChannels();
  };

  const handleSelectChat = (type, id, name) => {
    setSelectedChat({ type, id, name });
    onSelectChat(type, id, name);
  };

  const handleStartDM = async (memberId, memberName) => {
    handleSelectChat("dm", memberId, memberName);
    
    // Create or get DM conversation
    const existing = directMessages.find(dm => dm.id === memberId);
    if (!existing) {
      setDirectMessages([...directMessages, { id: memberId, name: memberName }]);
    }
  };

  return (
    <div className="w-64 bg-[#1A1A1A] text-white flex flex-col border-r border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="font-bold text-lg">{currentUserName}</h3>
        <p className="text-xs text-gray-400">Sales Team Chat</p>
      </div>

      {/* New Channel */}
      <div className="p-4 border-b border-gray-700">
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-sm bg-gray-800 hover:bg-gray-700 border-gray-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Channel
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#1A1A1A] border border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Channel name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
              <Button
                onClick={handleCreateChannel}
                className="w-full bg-[#B8956A] hover:bg-[#A68559]"
              >
                Create Channel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase">Channels</p>
          <div className="mt-3 space-y-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleSelectChat("channel", channel.id, channel.name)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                  selectedChat?.id === channel.id
                    ? "bg-[#B8956A]/20 text-[#B8956A]"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <Hash className="w-4 h-4" />
                {channel.name}
              </button>
            ))}
          </div>
        </div>

        {/* Direct Messages */}
        <div className="px-4 py-3 border-t border-gray-700">
          <p className="text-xs font-semibold text-gray-500 uppercase">Direct Messages</p>
          <div className="mt-3 space-y-1">
            {directMessages.map((dm) => (
              <button
                key={dm.id}
                onClick={() => handleSelectChat("dm", dm.id, dm.name)}
                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                  selectedChat?.id === dm.id
                    ? "bg-[#B8956A]/20 text-[#B8956A]"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                {dm.name}
              </button>
            ))}
          </div>

          {/* Start New DM */}
          {teamMembers.length > 0 && directMessages.length < teamMembers.length && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Team Members</p>
              <div className="space-y-1">
                {teamMembers.map((member) => {
                  const hasConversation = directMessages.some(dm => dm.id === member.id);
                  if (hasConversation) return null;
                  return (
                    <button
                      key={member.id}
                      onClick={() => handleStartDM(member.id, member.full_name)}
                      className="w-full text-left px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800"
                    >
                      + {member.full_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}