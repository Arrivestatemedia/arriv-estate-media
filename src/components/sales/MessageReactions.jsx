import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { SmilePlus } from "lucide-react";

const EXTENDED_EMOJIS = ["👍", "👀", "✅", "❌", "😂", "🔥", "😕", "🚀"];

export default function MessageReactions({ message, currentUserId, onReactionUpdate }) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReaction = async (emoji) => {
    try {
      const reactions = { ...message.reactions } || {};
      if (!reactions[emoji]) reactions[emoji] = [];
      
      const hasReacted = reactions[emoji].includes(currentUserId);
      if (hasReacted) {
        reactions[emoji] = reactions[emoji].filter(id => id !== currentUserId);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(currentUserId);
      }

      await base44.entities.ChatMessage.update(message.id, { reactions });
      onReactionUpdate?.();
      setShowPicker(false);
    } catch (e) {
      console.error(e);
    }
  };

  const currentReactions = message.reactions || {};

  return (
    <div className="flex flex-wrap gap-1 items-center mt-1.5">
      {Object.entries(currentReactions).map(([emoji, users]) => {
        const hasReacted = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${
              hasReacted
                ? "bg-[#B8956A]/20 text-gray-900 border border-[#B8956A]"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title={users.join(", ")}
          >
            {emoji} {users.length}
          </button>
        );
      })}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <SmilePlus className="w-3 h-3" />
        </button>
        {showPicker && (
          <div className="absolute bottom-full mb-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-40 z-20">
            {EXTENDED_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="text-lg hover:bg-gray-100 rounded p-0.5 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}