import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import MessageReactions from "./MessageReactions";

export default function ThreadPanel({ parentMessage, channelId, currentUserId, currentUserName, onClose, memberProfiles = {} }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const STATUS_COLORS = {
    online: "#22c55e", available: "#22c55e", busy: "#ef4444",
    in_meeting: "#f97316", away: "#eab308", lunch: "#a855f7",
    break: "#3b82f6", offline: "#6b7280"
  };

  useEffect(() => {
    loadReplies();

    // Subscribe to new replies in real-time
    const unsubscribe = base44.entities.ChatMessage.subscribe((event) => {
      if (event.data?.parent_message_id === parentMessage.id) {
        if (event.type === "create") {
          setReplies(prev => [...prev, event.data]);
        } else if (event.type === "update") {
          setReplies(prev => prev.map(m => m.id === event.data.id ? event.data : m));
        }
      }
    });

    return unsubscribe;
  }, [parentMessage?.id]);

  const loadReplies = async () => {
    setLoading(true);
    try {
      const msgs = await base44.entities.ChatMessage.filter(
        { parent_message_id: parentMessage.id },
        "timestamp",
        100
      );
      setReplies(msgs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    try {
      await base44.entities.ChatMessage.create({
        channel_id: channelId,
        parent_message_id: parentMessage.id,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content: text,
        timestamp: new Date().toISOString(),
        reactions: {}
      });
      setReplyText("");
      await loadReplies();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const renderMessageContent = (content) => {
    if (!content) return null;
    if (content.startsWith("[image]")) {
      const url = content.slice(7);
      return <img src={url} alt="shared" className="max-w-[200px] max-h-[160px] rounded-lg mt-1 cursor-pointer" onClick={() => window.open(url, '_blank')} />;
    }
    if (content.startsWith("[file|")) {
      const match = content.match(/^\[file\|(.+?)\](.+)$/);
      if (match) {
        return <a href={match[2]} target="_blank" rel="noopener noreferrer" className="text-[#B8956A] underline text-sm mt-1 block">📎 {match[1]}</a>;
      }
    }
    return <p className="text-gray-700 text-sm mt-1 break-words">{content}</p>;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <h3 className="font-semibold text-gray-900">Thread</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Parent Message */}
      <div className="p-4 border-b bg-white">
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-[#B8956A]/20 flex items-center justify-center text-[#B8956A] font-bold text-sm flex-shrink-0">
            {memberProfiles[parentMessage.sender_id] ? (
              <img src={memberProfiles[parentMessage.sender_id]} alt={parentMessage.sender_name} className="w-full h-full object-cover rounded-full" />
            ) : (
              parentMessage.sender_name?.[0]?.toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-gray-900 text-sm">{parentMessage.sender_name}</span>
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(parentMessage.timestamp), { addSuffix: true })}
              </span>
            </div>
            {renderMessageContent(parentMessage.content)}
          </div>
        </div>
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-gray-500 text-sm">Loading replies...</div>
        ) : replies.length === 0 ? (
          <div className="text-center text-gray-500 text-sm">No replies yet. Start the conversation!</div>
        ) : (
          replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-[#B8956A]/20 flex items-center justify-center text-[#B8956A] font-bold text-xs flex-shrink-0">
                {memberProfiles[reply.sender_id] ? (
                  <img src={memberProfiles[reply.sender_id]} alt={reply.sender_name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  reply.sender_name?.[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-gray-900 text-sm">{reply.sender_name}</span>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(reply.timestamp), { addSuffix: true })}
                  </span>
                </div>
                {renderMessageContent(reply.content)}
                <MessageReactions 
                  message={reply} 
                  currentUserId={currentUserId} 
                  onReactionUpdate={loadReplies}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reply Input */}
      <div className="border-t border-gray-200 p-3 bg-white">
        <form onSubmit={handleSendReply} className="flex gap-2 items-center">
          <Input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply in thread..."
            className="flex-1 text-sm"
            disabled={sending}
          />
          <Button type="submit" size="sm" className="bg-[#B8956A] hover:bg-[#A68559]" disabled={sending}>
            {sending ? "..." : "Reply"}
          </Button>
        </form>
      </div>
    </div>
  );
}