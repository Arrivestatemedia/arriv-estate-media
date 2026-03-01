import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X } from "lucide-react";

const EMOJI_QUICK_SELECT = ["👍", "😂", "❤️", "😲", "😢", "👏", "🎉", "🔥"];

export default function VideoChat({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (message.trim()) {
      setMessages([...messages, { type: "sent", content: message, time: new Date() }]);
      setMessage("");
      setShowEmojis(false);
    }
  };

  const handleEmojiClick = (emoji) => {
    setMessage(message + emoji);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 h-full w-72 bg-gray-900/95 backdrop-blur-sm border-l border-gray-700 flex flex-col shadow-xl z-[60]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h3 className="text-white font-semibold text-sm">Chat</h3>
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="text-gray-400 hover:text-white h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-xs text-center">
            No messages yet
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.type === "sent" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  msg.type === "sent"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-200"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Selector */}
      {showEmojis && (
        <div className="px-3 py-2 border-t border-gray-700 bg-gray-800">
          <div className="grid grid-cols-4 gap-2">
            {EMOJI_QUICK_SELECT.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="text-2xl hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-700 space-y-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowEmojis(!showEmojis)}
          className="w-full text-gray-400 hover:text-white text-xs"
        >
          😊 Emoji
        </Button>
        <div className="flex gap-2">
          <Input
            placeholder="Type message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 text-xs h-8"
          />
          <Button
            size="icon"
            onClick={handleSendMessage}
            className="bg-blue-600 hover:bg-blue-700 h-8 w-8"
          >
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}