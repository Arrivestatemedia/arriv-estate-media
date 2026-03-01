import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X } from "lucide-react";
import { format } from "date-fns";

export default function VideoChat({ isOpen, onClose, currentUserName, roomName, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load messages from database
  useEffect(() => {
    if (!roomName) return;

    const loadMessages = async () => {
      try {
        const msgs = await base44.entities.VideoCallMessage.filter(
          { room_name: roomName },
          'created_date',
          100
        );
        setMessages(msgs || []);
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    };

    loadMessages();

    // Subscribe to new messages
    const unsubscribe = base44.entities.VideoCallMessage.subscribe((event) => {
      if (event.type === 'create' && event.data?.room_name === roomName) {
        setMessages(prev => [...prev, event.data]);
      }
    });

    return unsubscribe;
  }, [roomName]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || !roomName) return;

    setLoading(true);
    try {
      await base44.entities.VideoCallMessage.create({
        room_name: roomName,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content: message.trim()
      });
      setMessage("");
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 left-0 h-full w-72 bg-gray-900/95 backdrop-blur-sm border-r border-gray-700 flex flex-col z-[8]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
        <h3 className="text-white font-semibold text-sm">In-call Chat</h3>
        <Button size="icon" variant="ghost" onClick={onClose} className="text-gray-400 hover:text-white h-7 w-7">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-xs text-center">Messages are visible to everyone in the call</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender_id === currentUserId ? "items-end" : "items-start"}`}>
              <span className="text-gray-400 text-[10px] mb-0.5 px-1">
                {msg.sender_id === currentUserId ? "You" : msg.sender_name} · {format(msg.created_date, "h:mm a")}
              </span>
              <div className={`max-w-[200px] rounded-lg px-3 py-2 text-sm break-words ${
                msg.sender_id === currentUserId ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-3 border-t border-gray-700 flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Message everyone..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={loading}
          className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-xs h-8 flex-1"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!message.trim() || loading}
          className="bg-blue-600 hover:bg-blue-700 h-8 w-8 flex-shrink-0"
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}