import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Smile } from "lucide-react";
import { base44 } from "@/api/base44Client";

const EMOJIS = [
  "😀", "😂", "😍", "🤔", "👍", "🎉", "🚀", "💯",
  "❤️", "🔥", "😎", "🙏", "👌", "✨", "💪", "👏"
];

export default function ChatPanel({ remoteParticipantName, roomName, currentUserId, currentUserName }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const messagesEndRef = useRef(null);

  // Load and subscribe to messages
  useEffect(() => {
    if (!roomName) {
      console.warn('ChatPanel: no roomName');
      return;
    }
    if (!currentUserId) {
      console.warn('ChatPanel: no currentUserId');
      return;
    }

    const loadMessages = async () => {
      try {
        const msgs = await base44.entities.VideoCallChat.filter(
          { room_name: roomName },
          "timestamp",
          100
        );
        setMessages(msgs || []);
      } catch (err) {
        console.error("Failed to load chat:", err);
      }
    };

    loadMessages();

    // Subscribe to new messages
    const unsubscribe = base44.entities.VideoCallChat.subscribe((event) => {
      if (event.data?.room_name === roomName) {
        if (event.type === "create") {
          setMessages(prev => [...prev, event.data]);
        }
      }
    });

    return unsubscribe;
  }, [roomName, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !roomName) return;
    const text = inputValue.trim();
    
    try {
      await base44.entities.VideoCallChat.create({
        room_name: roomName,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content: text,
        timestamp: new Date().toISOString()
      });
      setInputValue("");
      setShowEmojis(false);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleEmojiClick = (emoji) => {
    setInputValue(inputValue + emoji);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-80 flex flex-col bg-black/40 rounded-xl border border-purple-500/20 overflow-hidden">
      {/* Header */}
      <div className="bg-black/60 backdrop-blur px-4 py-3 border-b border-purple-500/20">
        <h3 className="text-white font-semibold text-sm">Chat</h3>
        <p className="text-purple-300 text-xs">{remoteParticipantName || "Participant"}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <p className="text-purple-300/50 text-sm">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === currentUserId ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  msg.sender_id === currentUserId
                    ? "bg-purple-600/70 text-white rounded-br-none"
                    : "bg-slate-700/70 text-purple-100 rounded-bl-none"
                }`}
              >
                <p className="break-words">{msg.content}</p>
                <p className="text-xs mt-1 opacity-60">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      {showEmojis && (
        <div className="bg-black/60 border-t border-purple-500/20 p-3 grid grid-cols-4 gap-2">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="text-xl hover:bg-purple-500/30 p-2 rounded transition"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="bg-black/60 border-t border-purple-500/20 p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={roomName ? "Type a message..." : "Not connected..."}
            disabled={!roomName}
            className="flex-1 bg-slate-900/50 border border-purple-500/30 rounded px-3 py-2 text-white text-sm placeholder-purple-300/50 focus:outline-none focus:border-purple-500/60 disabled:opacity-50"
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowEmojis(!showEmojis)}
            disabled={!roomName}
            className="text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"
          >
            <Smile className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || !roomName}
            className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}