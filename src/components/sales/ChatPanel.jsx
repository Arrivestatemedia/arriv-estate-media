import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Smile } from "lucide-react";

const EMOJI_SET = ["😊", "😂", "❤️", "👍", "🎉", "😍", "🔥", "💯", "👌", "😎", "🤔", "😢", "🙏", "😴", "🤗"];

export default function ChatPanel({ messages, onSendMessage, remoteParticipantName }) {
  const [messageText, setMessageText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (messageText.trim()) {
      onSendMessage(messageText);
      setMessageText("");
      setShowEmojiPicker(false);
    }
  };

  const handleEmojiClick = (emoji) => {
    setMessageText(messageText + emoji);
  };

  return (
    <div className="w-80 bg-slate-850 border-l border-slate-700/50 flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 border-b border-slate-700/50">
        <h3 className="text-white font-semibold text-sm">{remoteParticipantName || "Chat"}</h3>
        <p className="text-slate-400 text-xs">Video call chat</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-900/50">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-center">
            <p className="text-xs">Start a conversation</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.sender === "self" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-lg text-sm break-words ${
                    msg.sender === "self"
                      ? "bg-blue-500/80 text-white rounded-br-none"
                      : "bg-slate-700/50 text-slate-100 rounded-bl-none"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-700/50 bg-slate-900/50 p-3 space-y-2">
        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-700 grid grid-cols-5 gap-2 mb-2">
            {EMOJI_SET.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className="text-xl hover:bg-slate-700 rounded p-2 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Message..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
          />
          <Button
            size="icon"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="h-9 w-9 bg-slate-700 hover:bg-slate-600 rounded-lg"
            title="Add emoji"
          >
            <Smile className="w-4 h-4 text-slate-300" />
          </Button>
          <Button
            size="icon"
            onClick={handleSendMessage}
            className="h-9 w-9 bg-blue-500 hover:bg-blue-600 rounded-lg"
            title="Send message"
          >
            <Send className="w-4 h-4 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}