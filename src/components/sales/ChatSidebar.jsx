import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Hash, MessageSquare, ChevronDown, Search } from "lucide-react";
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

export default function ChatSidebar({ currentUserId, currentUserName, onSelectChat, memberStatuses = {}, isAdmin = false, onSelectProfile = null }) {
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [myStatus, setMyStatus] = useState("online");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredMembers, setFilteredMembers] = useState([]);
  const statusRef = useRef(null);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setShowStatusPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    loadChannels();
    loadDirectMessages();
    loadTeamMembers();
    // Load current user's status
    if (currentUserId && memberStatuses[currentUserId]) {
      setMyStatus(memberStatuses[currentUserId]);
    } else if (currentUserId) {
      base44.entities.SalesTeamMember.filter({ id: currentUserId }).then(members => {
        if (members?.[0]?.chat_status) setMyStatus(members[0].chat_status);
      }).catch(() => {});
    }

    // Subscribe to real-time status changes
    const unsub = base44.entities.SalesTeamMember.subscribe((event) => {
      if (event.type === "update") {
        setTeamMembers(prev => prev.map(m => m.id === event.id ? { ...m, ...event.data } : m));
        if (event.id === currentUserId && event.data?.chat_status) {
          setMyStatus(event.data.chat_status);
        }
      }
    });
    return unsub;
  }, [currentUserId, memberStatuses]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMembers([]);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = teamMembers.filter(m => m.full_name.toLowerCase().includes(query));
      setFilteredMembers(filtered);
    }
  }, [searchQuery, teamMembers]);

  const handleSetStatus = async (val) => {
    setMyStatus(val);
    setShowStatusPicker(false);
    if (currentUserId) {
      try {
        await base44.entities.SalesTeamMember.update(currentUserId, { chat_status: val });
      } catch (error) {
        console.error('Failed to update status:', error);
      }
    }
  };

  const loadChannels = async () => {
    const allChannels = await base44.entities.ChatChannel.list();
    setChannels(allChannels || []);
  };

  const loadDirectMessages = async () => {
    const dms = await base44.entities.DirectMessage.filter({
      $or: [{ sender_id: currentUserId }, { recipient_id: currentUserId }]
    }, "-timestamp");

    // Get unique conversations with latest message timestamp
    const conversations = {};
    dms?.forEach(dm => {
      const otherId = dm.sender_id === currentUserId ? dm.recipient_id : dm.sender_id;
      if (!conversations[otherId] || new Date(dm.timestamp) > new Date(conversations[otherId].timestamp)) {
        conversations[otherId] = { id: otherId, timestamp: dm.timestamp };
      }
    });

    // Get current names from SalesTeamMember to ensure they're up-to-date
    const conversationIds = Object.keys(conversations);
    if (conversationIds.length > 0) {
      const members = await base44.entities.SalesTeamMember.filter({
        id: { $in: conversationIds }
      });
      const memberMap = {};
      members?.forEach(m => { memberMap[m.id] = m.full_name; });
      
      const finalConversations = Object.entries(conversations).map(([id, conv]) => ({
        id,
        name: memberMap[id] || id,
        timestamp: conv.timestamp
      }));
      setDirectMessages(finalConversations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } else {
      setDirectMessages([]);
    }
  };

  const loadTeamMembers = async () => {
    const members = await base44.entities.SalesTeamMember.list();
    setTeamMembers(members?.filter(m => m.id !== currentUserId && m.is_active !== false && m.role !== 'admin') || []);
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
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="font-bold text-lg">{currentUserName}</h3>
            {/* Status picker */}
            <div className="relative mt-2" ref={statusRef}>
          <button
            onClick={() => setShowStatusPicker(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
          >
            <StatusDot value={myStatus} />
            <span>{statusFor(myStatus).label}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {showStatusPicker && (
            <div className="absolute left-0 top-full mt-1 bg-[#2a2a2a] border border-gray-700 rounded-lg shadow-xl z-50 py-1 w-44">
              {STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleSetStatus(s.value)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-700 transition-colors ${myStatus === s.value ? 'text-white' : 'text-gray-300'}`}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.color, display: 'inline-block', flexShrink: 0 }} />
                  {s.label}
                  {myStatus === s.value && <span className="ml-auto text-[#B8956A]">✓</span>}
                </button>
              ))}
            </div>
          )}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => onSelectProfile && onSelectProfile(currentUserId, currentUserName, myStatus)}
              className="text-xs text-gray-400 hover:text-[#B8956A] mt-1 transition-colors"
            >
              View Profile
            </button>
          )}
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-gray-700">
          <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
          <Input
           placeholder="Search team members..."
           value={searchQuery}
           onChange={(e) => setSearchQuery(e.target.value)}
           className="pl-8 h-8 text-xs bg-gray-800 border-gray-700"
          />
          </div>
          </div>

          {/* Search Results */}
          {searchQuery && filteredMembers.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-700">
          <p className="text-xs text-gray-500 uppercase mb-2">Search Results</p>
          <div className="space-y-1">
           {filteredMembers.map(member => (
             <button
               key={member.id}
               onClick={() => {
                 handleStartDM(member.id, member.full_name);
                 setSearchQuery("");
               }}
               className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-gray-800 flex items-center gap-2"
             >
               <StatusDot value={member.chat_status || 'offline'} size={6} />
               {member.full_name}
             </button>
           ))}
          </div>
          </div>
          )}

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
            {directMessages.map((dm) => {
              const member = teamMembers.find(m => m.id === dm.id);
              return (
                <button
                  key={dm.id}
                  onClick={() => handleSelectChat("dm", dm.id, dm.name)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                    selectedChat?.id === dm.id
                      ? "bg-[#B8956A]/20 text-[#B8956A]"
                      : "text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <MessageSquare className="w-4 h-4" />
                    {member?.chat_status && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#1A1A1A]"
                        style={{ backgroundColor: statusFor(member.chat_status).color }} />
                    )}
                  </div>
                  {dm.name}
                </button>
              );
            })}
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
                      className="w-full text-left px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 flex items-center gap-2"
                    >
                      <StatusDot value={member.chat_status || 'offline'} size={8} />
                      {member.full_name}
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