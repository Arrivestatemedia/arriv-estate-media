import React from "react";
import { Loader2, MessageSquare } from "lucide-react";

function when(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const today = new Date();
  const sameDay = parsed.toDateString() === today.toDateString();
  return sameDay
    ? parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function UnknownTextThreadList({ conversations, selectedId, onSelect, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="px-5 py-16 text-center">
        <MessageSquare className="w-8 h-8 mx-auto mb-3 text-[#B8956A]/50" />
        <p className="text-sm text-[#1A1A1A]/60">No unknown-number texts yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[#B8956A]/15">
      {conversations.map((conversation) => {
        const active = conversation.id === selectedId;
        return (
          <li key={conversation.id}>
            <button
              onClick={() => onSelect(conversation.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                active ? "bg-[#B8956A]/10" : "hover:bg-[#B8956A]/5"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-sm text-[#1A1A1A] truncate">
                  {conversation.from_number || "Unknown number"}
                </span>
                <span className="text-[11px] text-[#1A1A1A]/45 shrink-0">
                  {when(conversation.last_message_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#1A1A1A]/60 line-clamp-2">
                {conversation.last_message || "No message text"}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}