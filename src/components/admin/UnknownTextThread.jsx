import React from "react";
import { Loader2, MessageSquare } from "lucide-react";

function stamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UnknownTextThread({ thread, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (!thread?.conversation) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <MessageSquare className="w-8 h-8 mb-3 text-[#B8956A]/50" />
        <p className="text-sm text-[#1A1A1A]/60">Choose a number to read its messages.</p>
      </div>
    );
  }

  const messages = thread.messages || [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-[#B8956A]/20">
        <p className="font-serif text-lg text-[#1A1A1A]">{thread.conversation.from_number || "Unknown number"}</p>
        <p className="text-xs text-[#1A1A1A]/50">
          {messages.length} message{messages.length === 1 ? "" : "s"} · no rep assigned
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((message) => {
          const inbound = message.direction === "inbound";
          return (
            <div key={message.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  inbound
                    ? "bg-[#1A1A1A] text-[#FFFBF5]"
                    : "bg-[#B8956A]/15 text-[#1A1A1A] border border-[#B8956A]/25"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body || "(no text)"}</p>
                <p className={`mt-1 text-[10px] ${inbound ? "text-[#FFFBF5]/50" : "text-[#1A1A1A]/45"}`}>
                  {inbound ? "From" : "To"} {inbound ? message.from_number : message.to_number} · {stamp(message.created_date)}
                </p>
              </div>
            </div>
          );
        })}
        {!messages.length && (
          <p className="text-sm text-[#1A1A1A]/50 text-center py-10">No messages stored for this number.</p>
        )}
      </div>
    </div>
  );
}