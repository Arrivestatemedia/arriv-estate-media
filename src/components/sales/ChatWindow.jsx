import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Search, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";

export default function ChatWindow({ chatType, chatId, chatName, currentUserId, currentUserName, memberProfiles = {} }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const messagesEndRef = useRef(null);

  // Register service worker and request notification permission
  useEffect(() => {
    // Register service worker for push notifications
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(err => {
        console.log("Service worker registration failed:", err);
      });
    }

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        setNotificationsEnabled(true);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          if (permission === "granted") {
            setNotificationsEnabled(true);
          }
        });
      }
    }
  }, []);

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
        const msgs = await base44.entities.ChatMessage.filter({ channel_id: chatId }, "timestamp", 50);
        setMessages(msgs);
      } else if (chatType === "dm") {
        const msgs = await base44.entities.DirectMessage.filter(
          { $or: [
            { sender_id: currentUserId, recipient_id: chatId },
            { sender_id: chatId, recipient_id: currentUserId }
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
              setMessages(prev => [...prev, event.data]);
              // Send push notification if from another user
              if (event.data?.sender_id !== currentUserId) {
                base44.functions.invoke('sendPushNotification', {
                  recipientId: currentUserId,
                  title: `New message in #${chatName}`,
                  body: event.data?.content,
                  tag: `channel-${chatId}`
                }).catch(err => console.error('Push notification error:', err));
              }
            }
          }
        })
      : base44.entities.DirectMessage.subscribe((event) => {
          if ((event.data?.sender_id === currentUserId || event.data?.recipient_id === currentUserId) &&
              (event.data?.sender_id === chatId || event.data?.recipient_id === chatId)) {
            if (event.type === "create") {
              setMessages(prev => [...prev, event.data]);
              // Send push notification if from the other user
              if (event.data?.sender_id !== currentUserId) {
                base44.functions.invoke('sendPushNotification', {
                  recipientId: currentUserId,
                  title: `New message from ${event.data?.sender_name}`,
                  body: event.data?.content,
                  tag: `dm-${event.data?.sender_id}`
                }).catch(err => console.error('Push notification error:', err));
              }
            }
          }
        });

    return unsubscribe;
  }, [chatId, chatType, currentUserId]);

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
          timestamp: new Date().toISOString()
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

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{chatType === "channel" ? "#" : ""}{chatName}</h2>
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
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-[#B8956A]/20 flex items-center justify-center text-[#B8956A] font-bold text-sm">
                  {profileUrl ? (
                    <img src={profileUrl} alt={msg.sender_name} className="w-full h-full object-cover" />
                  ) : initials}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-900">{msg.sender_name}</span>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(msg.timestamp || msg.created_date), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-gray-700 text-sm mt-1 break-words">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" size="sm" className="bg-[#B8956A] hover:bg-[#A68559]">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}