import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";

const EXTENDED_EMOJIS = ["👍", "👀", "✅", "❌", "😂", "🔥", "😕", "🚀"];

export default function MessageReactions({ message, currentUserId, onReactionUpdate, messageType = "channel" }) {
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

        const entity = messageType === "channel" ? base44.entities.ChatMessage : base44.entities.DirectMessage;
        await entity.update(message.id, { reactions });
        onReactionUpdate?.();
        setShowPicker(false);
      } catch (e) {
        console.error("Reaction error:", e);
        toast.error("Failed to add reaction");
      }
    };

  const currentReactions = message.reactions || {};

  return (
    <div className="mt-2 flex flex-wrap gap-2 items-center max-w-full">
      {Object.entries(currentReactions).map(([emoji, users]) => {
        const hasReacted = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className={`px-2.5 py-1.5 rounded-full transition-colors whitespace-nowrap text-sm flex items-center gap-1 flex-shrink-0 ${
              hasReacted
                ? "bg-[#B8956A]/20 text-gray-900 border border-[#B8956A]"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            title={users.join(", ")}
          >
            <span className="text-base">{emoji}</span>
            <span className="text-xs font-medium">{users.length}</span>
          </button>
        );
      })}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="px-2.5 py-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-sm"
          title="Add reaction"
        >
          <SmilePlus className="w-4 h-4" />
        </button>
        {showPicker && (
          <div className="absolute bottom-full mb-2 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1 w-56 z-20">
            {EXTENDED_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="text-2xl hover:bg-gray-100 rounded p-1.5 transition-colors"
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