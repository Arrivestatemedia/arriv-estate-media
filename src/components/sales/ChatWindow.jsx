import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Bell, Paperclip, Smile, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import MessageReactions from "./MessageReactions";
import ThreadPanel from "./ThreadPanel";
import ChatContactCard from "./ChatContactCard";
import ContactCardDisplay from "./ContactCardDisplay";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","👍","👎","❤️","🔥","🎉","✅","😅","🙏","💪","😢","😡","🤣","👀","💯","🚀","⭐","😊","🤝","👏"];

const STATUS_COLORS = {
  online: "#22c55e", available: "#22c55e", busy: "#ef4444",
  in_meeting: "#f97316", away: "#eab308", lunch: "#a855f7",
  break: "#3b82f6", offline: "#6b7280"
};

const playDing = () => {
  try {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.log('Audio error:', e);
  }
};


export default function ChatWindow({ chatType, chatId, chatName, currentUserId, currentUserName, memberProfiles = {}, memberStatuses = {}, salesMemberId }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const syncIntervalRef = useRef(null);

  // Request / check notification permission
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(p => {
        if (p === "granted") setNotificationsEnabled(true);
      });
    }
  }, []);

  // Auto-sync chat status with Google Calendar every 3 minutes
  useEffect(() => {
    if (!salesMemberId) return;

    const syncStatus = async () => {
      try {
        await base44.functions.invoke('syncChatStatusWithCalendar', { salesMemberId });
      } catch (err) {
        console.error('Error syncing calendar:', err);
      }
    };

    syncStatus();
    syncIntervalRef.current = setInterval(syncStatus, 3 * 60 * 1000); // Every 3 minutes

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [salesMemberId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!chatId) return;

    const loadMessages = async () => {
      setLoading(true);
      if (chatType === "channel") {
        const msgs = await base44.entities.ChatMessage.filter({ channel_id: chatId, parent_message_id: null }, "timestamp", 50);
        setMessages(msgs);
      } else if (chatType === "dm") {
        const msgs = await base44.entities.DirectMessage.filter(
          { $or: [
            { sender_id: currentUserId, recipient_id: chatId, parent_message_id: null },
            { sender_id: chatId, recipient_id: currentUserId, parent_message_id: null }
          ] },
          "timestamp",
          50
        );
        setMessages(msgs);

        // Mark messages as read
        msgs.forEach(msg => {
          if (msg.recipient_id === currentUserId && !msg.read) {
            base44.entities.DirectMessage.update(msg.id, { read: true });
          }
        });
      }
      setLoading(false);
    };

    loadMessages();

    // Subscribe to real-time updates
    const unsubscribe = chatType === "channel"
      ? base44.entities.ChatMessage.subscribe((event) => {
          if (event.data?.channel_id === chatId) {
            if (event.type === "create") {
              // Only show main messages in channel (filter out thread replies)
              if (!event.data?.parent_message_id) {
                setMessages(prev => {
                  const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-') || m.sender_id !== currentUserId || m.content !== event.data.content);
                  return [...withoutOptimistic, event.data];
                });
                if (event.data?.sender_id !== currentUserId) {
                  playDing();
                  toast.message(`#${chatName}`, {
                    description: `${event.data?.sender_name}: ${event.data?.content}`,
                  });
                  if (Notification.permission === "granted") {
                    try {
                      new Notification(`#${chatName}`, {
                        body: `${event.data?.sender_name}: ${event.data?.content}`,
                        icon: "/favicon.ico",
                        tag: `channel-${chatId}`
                      });
                    } catch (e) {}
                  }
                }
              } else if (event.data?.parent_message_id) {
                // Update thread reply count on parent message
                setMessages(prev => prev.map(m => {
                  if (m.id === event.data.parent_message_id) {
                    return {
                      ...m,
                      thread_reply_count: (m.thread_reply_count || 0) + 1
                    };
                  }
                  return m;
                }));
              }
            } else if (event.type === "update") {
              // Update reactions on messages
              setMessages(prev => prev.map(m => m.id === event.data.id ? event.data : m));
              if (selectedThread?.id === event.data.id) {
                setSelectedThread(event.data);
              }
            }
          }
        })
      : base44.entities.DirectMessage.subscribe((event) => {
          if ((event.data?.sender_id === currentUserId || event.data?.recipient_id === currentUserId) &&
              (event.data?.sender_id === chatId || event.data?.recipient_id === chatId)) {
            if (event.type === "create") {
              // Only show main messages (filter out thread replies)
              if (!event.data?.parent_message_id) {
                setMessages(prev => {
                  const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-') || m.sender_id !== currentUserId || m.content !== event.data.content);
                  return [...withoutOptimistic, event.data];
                });
                if (event.data?.sender_id !== currentUserId) {
                  playDing();
                  toast.message(event.data?.sender_name, {
                    description: event.data?.content,
                  });
                  if (Notification.permission === "granted") {
                    try {
                      new Notification(event.data?.sender_name, {
                        body: event.data?.content,
                        icon: "/favicon.ico",
                        tag: `dm-${event.data?.sender_id}`
                      });
                    } catch (e) {}
                  }
                }
              } else if (event.data?.parent_message_id) {
                // Update thread reply count on parent message
                setMessages(prev => prev.map(m => {
                  if (m.id === event.data.parent_message_id) {
                    return {
                      ...m,
                      thread_reply_count: (m.thread_reply_count || 0) + 1
                    };
                  }
                  return m;
                }));
              }
            } else if (event.type === "update") {
              // Update reactions on messages
              setMessages(prev => prev.map(m => m.id === event.data.id ? event.data : m));
              if (selectedThread?.id === event.data.id) {
                setSelectedThread(event.data);
              }
            }
          }
        });

    return unsubscribe;
  }, [chatId, chatType, currentUserId]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const isImage = file.type.startsWith("image/");
      const content = isImage ? `[image]${file_url}` : `[file|${file.name}]${file_url}`;
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content,
        timestamp: new Date().toISOString(),
        ...(chatType === "channel" ? { channel_id: chatId } : { recipient_id: chatId, recipient_name: chatName }),
      };
      setMessages(prev => [...prev, optimisticMsg]);
      if (chatType === "channel") {
        await base44.entities.ChatMessage.create({ channel_id: chatId, sender_id: currentUserId, sender_name: currentUserName, content, timestamp: new Date().toISOString() });
      } else {
        await base44.entities.DirectMessage.create({ sender_id: currentUserId, sender_name: currentUserName, recipient_id: chatId, recipient_name: chatName, content, timestamp: new Date().toISOString() });
      }
    } catch (err) {
      console.error("Upload error:", err);
    }
    setUploading(false);
    e.target.value = "";
  };

  const renderMessageContent = (content) => {
    if (!content) return null;
    if (content.startsWith("[contact]")) {
      return <ContactCardDisplay content={content} />;
    }
    if (content.startsWith("[image]")) {
      const url = content.slice(7);
      return <img src={url} alt="shared" className="max-w-[240px] max-h-[200px] rounded-lg mt-1 cursor-pointer" onClick={() => window.open(url, '_blank')} />;
    }
    if (content.startsWith("[file|")) {
      const match = content.match(/^\[file\|(.+?)\](.+)$/);
      if (match) {
        return <a href={match[2]} target="_blank" rel="noopener noreferrer" className="text-[#B8956A] underline text-sm mt-1 block">📎 {match[1]}</a>;
      }
    }
    return <p className="text-gray-700 text-sm mt-1 break-words">{content}</p>;
  };

  const handleSendMessage = async (e) => {
   e.preventDefault();
   const text = newMessage.trim();
   if (!text) return;

   // Optimistic update
   const optimisticMsg = {
     id: `temp-${Date.now()}`,
     sender_id: currentUserId,
     sender_name: currentUserName,
     content: text,
     timestamp: new Date().toISOString(),
     ...(chatType === "channel" ? { channel_id: chatId } : { recipient_id: chatId, recipient_name: chatName }),
   };
   setMessages(prev => [...prev, optimisticMsg]);
   setNewMessage("");

   try {
     if (chatType === "channel") {
       await base44.entities.ChatMessage.create({
         channel_id: chatId,
         sender_id: currentUserId,
         sender_name: currentUserName,
         content: text,
         timestamp: new Date().toISOString(),
         reactions: {}
       });
     } else if (chatType === "dm") {
       await base44.entities.DirectMessage.create({
         sender_id: currentUserId,
         sender_name: currentUserName,
         recipient_id: chatId,
         recipient_name: chatName,
         content: text,
         timestamp: new Date().toISOString()
       });

       // Send auto-response if recipient is in a meeting
       if (memberStatuses[chatId] === 'in_meeting') {
         setTimeout(async () => {
           try {
             await base44.entities.DirectMessage.create({
               sender_id: chatId,
               sender_name: chatName,
               recipient_id: currentUserId,
               recipient_name: currentUserName,
               content: "This person is in a meeting and will respond as soon as they're available.",
               timestamp: new Date().toISOString(),
               auto_response: true
             });
           } catch (e) {
             console.error("Error sending auto-response:", e);
           }
         }, 500);
       }
     }
   } catch (error) {
     console.error("Error sending message:", error);
     // Remove optimistic message on failure
     setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
     setNewMessage(text);
   }
  };

  if (!chatId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a channel or conversation to start chatting
      </div>
    );
  }

  if (selectedThread) {
     return (
       <ThreadPanel
         parentMessage={selectedThread}
         channelId={chatId}
         currentUserId={currentUserId}
         currentUserName={currentUserName}
         onClose={() => setSelectedThread(null)}
         memberProfiles={memberProfiles}
         chatType={chatType}
         recipientId={chatId}
       />
     );
   }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{chatType === "channel" ? "#" : ""}{chatName}</h2>
          {chatType === "dm" && memberStatuses[chatId] && (
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[memberStatuses[chatId]] || "#6b7280" }} />
          )}
        </div>
        {notificationsEnabled && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Bell className="w-4 h-4" />
            Notifications on
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-gray-500 text-sm">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg) => {
            const profileUrl = memberProfiles[msg.sender_id];
            const initials = (msg.sender_name || "?")[0].toUpperCase();
            return (
              <div key={msg.id} className="flex gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-[#B8956A]/20 flex items-center justify-center text-[#B8956A] font-bold text-sm">
                    {profileUrl ? (
                      <img src={profileUrl} alt={msg.sender_name} className="w-full h-full object-cover" />
                    ) : initials}
                  </div>
                  {memberStatuses[msg.sender_id] && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white"
                      style={{ backgroundColor: STATUS_COLORS[memberStatuses[msg.sender_id]] || "#6b7280" }} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">{msg.sender_name}</span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(msg.timestamp || msg.created_date), { addSuffix: true })}
                    </span>
                  </div>
                  {renderMessageContent(msg.content)}
                  <MessageReactions 
                    message={msg}
                    currentUserId={currentUserId}
                    onReactionUpdate={() => {
                      // Reload messages to show updated reactions
                      setMessages(prev => [...prev]);
                    }}
                  />
                  {msg.thread_reply_count > 0 && (
                    <button
                      onClick={() => setSelectedThread(msg)}
                      className="text-xs text-[#B8956A] hover:underline mt-1.5 flex items-center gap-1"
                    >
                      <MessageCircle className="w-3 h-3" />
                      {msg.thread_reply_count} {msg.thread_reply_count === 1 ? 'reply' : 'replies'}
                    </button>
                  )}
                  </div>
                  </div>
                  );
                  })
                  )}
                  <div ref={messagesEndRef} />
                  </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 relative">
        {showEmojis && (
          <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-64 z-10">
            {EMOJIS.map(emoji => (
              <button key={emoji} type="button" className="text-xl hover:bg-gray-100 rounded p-1"
                onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojis(false); }}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" />
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <ChatContactCard
            channelId={chatId}
            chatId={chatId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onContactAdded={() => {}}
            chatType={chatType}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-gray-400 hover:text-[#B8956A] transition-colors p-1 flex-shrink-0">
            <Paperclip className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setShowEmojis(v => !v)}
            className="text-gray-400 hover:text-[#B8956A] transition-colors p-1 flex-shrink-0">
            <Smile className="w-5 h-5" />
          </button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={uploading ? "Uploading..." : "Type a message..."}
            className="flex-1"
            disabled={uploading}
          />
          <Button type="submit" size="sm" className="bg-[#B8956A] hover:bg-[#A68559]" disabled={uploading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}