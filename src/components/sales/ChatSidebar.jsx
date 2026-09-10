import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Search, X, ChevronDown } from "lucide-react";

const STATUSES = [
  { value: "online",     label: "Online",      color: "#22c55e" },
  { value: "available",  label: "Available",   color: "#22c55e" },
  { value: "busy",       label: "Busy",        color: "#ef4444" },
  { value: "in_meeting", label: "In a Meeting", color: "#f97316" },
  { value: "away",       label: "Away",        color: "#eab308" },
  { value: "lunch",      label: "Lunch",       color: "#a855f7" },
  { value: "break",      label: "Break",       color: "#3b82f6" },
  { value: "offline",    label: "Offline",     color: "#6b7280" },
];

const statusFor = (val) => STATUSES.find(s => s.value === val) || STATUSES[7];

function Avatar({ name, size = 28, profileUrl, status }) {
  const initials = (name || "?")
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const dotSize = Math.round(size * 0.28);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full overflow-hidden flex items-center justify-center font-semibold"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.36),
          backgroundColor: "var(--chat-accent)",
          color: "var(--chat-on-accent)",
        }}
      >
        {profileUrl ? (
          <img src={profileUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {status && (
        <span
          className="absolute rounded-full border-2 border-white"
          style={{
            width: dotSize,
            height: dotSize,
            bottom: -1,
            right: -1,
            backgroundColor: statusFor(status).color,
          }}
        />
      )}
    </div>
  );
}

export default function ChatSidebar({ currentUserId, currentUserName, currentUserEmail, onSelectChat, memberStatuses = {} }) {
  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [arrivOneContacts, setArrivOneContacts] = useState([]);
  const [externalArrivOneContacts, setExternalArrivOneContacts] = useState([]);
  const [loadingArrivOne, setLoadingArrivOne] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [selectedChat, setSelectedChat] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [myStatus, setMyStatus] = useState("online");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const statusRef = useRef(null);

  // Close status picker on outside click
  useEffect(() => {
    const handler = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setShowStatusPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch same-company Arriv One contacts for cross-app chat
  const loadArrivOneContacts = async () => {
    if (!currentUserEmail) return;
    setLoadingArrivOne(true);
    try {
      const res = await base44.functions.invoke('listArrivOneChatContacts', { user_email: currentUserEmail });
      setArrivOneContacts(res?.data?.contacts || []);
    } catch (err) {
      console.error('Failed to load Arriv One contacts:', err);
      setArrivOneContacts([]);
    } finally {
      setLoadingArrivOne(false);
    }
  };

  useEffect(() => {
    loadChannels();
    loadDirectMessages();
    loadTeamMembers();
    loadArrivOneContacts();
    if (currentUserId && memberStatuses[currentUserId]) {
      setMyStatus(memberStatuses[currentUserId]);
    } else if (currentUserId) {
      base44.entities.SalesTeamMember.filter({ id: currentUserId }).then(members => {
        if (members?.[0]?.chat_status) setMyStatus(members[0].chat_status);
      }).catch(() => {});
    }

    let unsub = () => {};
    try {
      unsub = base44.entities.SalesTeamMember.subscribe((event) => {
        if (event.type === "update") {
          setTeamMembers(prev => prev.map(m => m.id === event.id ? { ...m, ...event.data } : m));
          if (event.id === currentUserId && event.data?.chat_status) {
            setMyStatus(event.data.chat_status);
          }
        }
      });
    } catch (e) {
      console.error('[ChatSidebar] SalesTeamMember subscribe failed:', e);
    }
    return unsub;
  }, [currentUserId, memberStatuses, currentUserEmail]);

  // Deduplicate Arriv One contacts: hide contacts who are already local team
  // members. For the mapped Arriv Estate Media organization, the same person may
  // have both a local SalesTeamMember record and a synced Arriv One record. They
  // represent ONE human and must appear as ONE chat identity. Only genuinely
  // external Arriv One contacts (not in the local team) appear in the "Arriv One"
  // section — these are Arriv One company employees outside Estate Media's org.
  useEffect(() => {
    const localEmails = new Set(
      teamMembers.map(m => m.email?.toLowerCase()).filter(Boolean)
    );
    if (currentUserEmail) localEmails.add(currentUserEmail.toLowerCase());
    const external = arrivOneContacts.filter(
      c => !localEmails.has(c.email?.toLowerCase())
    );
    setExternalArrivOneContacts(external);
  }, [teamMembers, arrivOneContacts, currentUserEmail]);

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

    const conversations = {};
    dms?.forEach(dm => {
      const otherId = dm.sender_id === currentUserId ? dm.recipient_id : dm.sender_id;
      if (!conversations[otherId] || new Date(dm.timestamp) > new Date(conversations[otherId].timestamp)) {
        conversations[otherId] = { id: otherId, timestamp: dm.timestamp };
      }
    });

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
    setTeamMembers(members?.filter(m => m.id !== currentUserId && m.is_active !== false) || []);
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
    const existing = directMessages.find(dm => dm.id === memberId);
    if (!existing) {
      setDirectMessages([...directMessages, { id: memberId, name: memberName }]);
    }
    setSearchQuery("");
  };

  const handleStartCrossAppDM = (contact) => {
    handleSelectChat("cross_app_dm", contact.email, contact.full_name || contact.email);
    setSearchQuery("");
  };

  const filteredTeamMembers = teamMembers.filter(m =>
    m.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const channelInitials = (name) =>
    name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="w-full h-full glass-sidebar flex flex-col">
      {/* Search row */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-full w-full pl-9 pr-9 py-2 text-sm text-slate-800 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* New channel button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setOpenDialog(true)}
          className="w-full flex items-center gap-2 px-2 py-2 text-slate-700 hover:bg-slate-200/60 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New channel
        </button>
      </div>

      {/* Scrollable channels + DMs */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {/* Channels */}
        <p className="text-xs font-semibold uppercase text-slate-500 px-2 py-2">Channels</p>
        <div className="space-y-1">
          {channels.map((channel) => {
            const active = selectedChat?.id === channel.id && selectedChat?.type === "channel";
            return (
              <button
                key={channel.id}
                onClick={() => handleSelectChat("channel", channel.id, channel.name)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors ${
                  active ? "chat-row-active" : "text-slate-700 hover:bg-slate-200/60"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                    active ? "bg-white/20 text-white" : "chat-initial-square"
                  }`}
                >
                  {channelInitials(channel.name)}
                </div>
                <span className="truncate">{channel.name}</span>
              </button>
            );
          })}
        </div>

        {/* Direct Messages */}
        <p className="text-xs font-semibold uppercase text-slate-500 px-2 py-2 mt-3">Direct Messages</p>
        <div className="space-y-1">
          {directMessages.map((dm) => {
            const active = selectedChat?.id === dm.id && selectedChat?.type === "dm";
            const member = teamMembers.find(m => m.id === dm.id);
            return (
              <button
                key={dm.id}
                onClick={() => handleSelectChat("dm", dm.id, dm.name)}
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                  active ? "chat-row-active" : "text-slate-700 hover:bg-slate-200/60"
                }`}
              >
                <Avatar
                  name={dm.name}
                  size={28}
                  status={member?.chat_status}
                />
                <span className="truncate">{dm.name}</span>
              </button>
            );
          })}
        </div>

        {/* Arriv One — cross-app contacts (same company).
            Hidden entirely when no contacts are available so the section
            header never shows up empty. */}
        {currentUserEmail && !loadingArrivOne && externalArrivOneContacts.length > 0 && (
          <>
            <p className="text-xs font-semibold uppercase text-slate-500 px-2 py-2 mt-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B8956A]"></span>
              Arriv One
            </p>
            <div className="space-y-1">
              {externalArrivOneContacts
                .filter(c => !searchQuery || (c.full_name || c.email).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((contact) => {
                  const active = selectedChat?.id === contact.email && selectedChat?.type === "cross_app_dm";
                  return (
                    <button
                      key={contact.email}
                      onClick={() => handleStartCrossAppDM(contact)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${
                        active ? "chat-row-active" : "text-slate-700 hover:bg-slate-200/60"
                      }`}
                    >
                      <Avatar name={contact.full_name || contact.email} size={28} />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="truncate">{contact.full_name || contact.email}</p>
                        <p className="text-xs text-slate-400 truncate">Arriv One</p>
                      </div>
                    </button>
                  );
                })}
            </div>
          </>
        )}

        {/* People search results */}
        {searchQuery && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase text-slate-500 px-2 py-2">People</p>
            <div className="space-y-1">
              {filteredTeamMembers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center px-2 py-4">No people found</p>
              ) : (
                filteredTeamMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleStartDM(member.id, member.full_name)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200/60 transition-colors"
                  >
                    <Avatar
                      name={member.full_name}
                      size={28}
                      profileUrl={member.profile_picture_url}
                      status={member.chat_status}
                    />
                    <span className="truncate">{member.full_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* User status bar at bottom — preserves existing status picker feature */}
      <div className="px-3 py-2 border-t border-white/40">
        <div className="relative" ref={statusRef}>
          <button
            onClick={() => setShowStatusPicker(v => !v)}
            className="w-full flex items-center gap-2.5 px-1 py-1 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <Avatar name={currentUserName} size={28} status={myStatus} />
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{currentUserName}</p>
              <p className="text-xs text-slate-500">{statusFor(myStatus).label}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </button>
          {showStatusPicker && (
            <div className="absolute bottom-full left-0 mb-2 glass-panel rounded-lg p-1 w-44 z-50">
              {STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => handleSetStatus(s.value)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-200/60 rounded transition-colors ${
                    myStatus === s.value ? "text-slate-900" : "text-slate-600"
                  }`}
                >
                  <span
                    style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: s.color, display: "inline-block", flexShrink: 0 }}
                  />
                  {s.label}
                  {myStatus === s.value && <span className="ml-auto text-slate-400">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New channel dialog — glass-panel modal */}
      {openDialog && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-panel rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">New Channel</h3>
              <button
                onClick={() => setOpenDialog(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              placeholder="Channel name"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="glass-input rounded-lg w-full px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 mb-4"
            />
            <button
              onClick={handleCreateChannel}
              className="w-full py-2.5 rounded-lg chat-accent-btn text-sm font-medium"
            >
              Create Channel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}