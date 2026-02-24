import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AdminChatWindow({ currentUserId, currentUserName }) {
  const [selectedRepId, setSelectedRepId] = useState(null);
  const [selectedRepName, setSelectedRepName] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [salesReps, setSalesReps] = useState([]);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // Load sales reps (non-admin, active users)
  useEffect(() => {
    base44.entities.SalesTeamMember.list().then(members => {
      const reps = members?.filter(m => m.is_active && m.role !== 'admin') || [];
      setSalesReps(reps);
    }).catch(() => {});
  }, []);

  // Load messages for selected rep
  const { data: messages = [] } = useQuery({
    queryKey: ['adminMessages', selectedRepId],
    queryFn: async () => {
      const allMessages = await base44.entities.DirectMessage.list('-timestamp', 100);
      return allMessages.filter(m => 
        (m.sender_id === currentUserId && m.recipient_id === selectedRepId) ||
        (m.sender_id === selectedRepId && m.recipient_id === currentUserId)
      ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },
    enabled: !!selectedRepId
  });

  // Fetch status of selected rep
  const { data: selectedRepStatus } = useQuery({
    queryKey: ['repStatus', selectedRepId],
    queryFn: async () => {
      if (!selectedRepId) return null;
      const rep = await base44.entities.SalesTeamMember.get(selectedRepId);
      return rep?.chat_status;
    },
    enabled: !!selectedRepId,
    refetchInterval: 5000
  });

  // Sound effect function
  const playDing = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.log('Audio error:', e);
    }
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content) => {
      return base44.entities.DirectMessage.create({
        sender_id: currentUserId,
        sender_name: currentUserName,
        recipient_id: selectedRepId,
        recipient_name: selectedRepName,
        content,
        timestamp: new Date().toISOString(),
        read: false
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminMessages'] });
      setMessageText("");
      
      // Send auto-response if rep is in a meeting
      if (selectedRepStatus === 'in_meeting') {
        setTimeout(async () => {
          try {
            await base44.entities.DirectMessage.create({
              sender_id: selectedRepId,
              sender_name: selectedRepName,
              recipient_id: currentUserId,
              recipient_name: currentUserName,
              content: "This person is in a meeting and will respond as soon as they're available.",
              timestamp: new Date().toISOString(),
              read: false,
              auto_response: true
            });
          } catch (e) {
            console.error("Error sending auto-response:", e);
          }
        }, 500);
      }
    }
  });

  // Subscribe to incoming messages and play sound
  useEffect(() => {
    if (!selectedRepId) return;
    
    const unsubscribe = base44.entities.DirectMessage.subscribe((event) => {
      if ((event.data?.sender_id === selectedRepId && event.data?.recipient_id === currentUserId) ||
          (event.data?.sender_id === currentUserId && event.data?.recipient_id === selectedRepId)) {
        if (event.type === "create" && event.data?.sender_id === selectedRepId) {
          playDing();
        }
      }
    });
    
    return unsubscribe;
  }, [selectedRepId, currentUserId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read when viewing
  useEffect(() => {
    if (selectedRepId && messages.length > 0) {
      messages.forEach(msg => {
        if (msg.recipient_id === currentUserId && !msg.read) {
          base44.entities.DirectMessage.update(msg.id, { read: true });
        }
      });
    }
  }, [selectedRepId, messages, currentUserId]);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedRepId) return;
    sendMessageMutation.mutate(messageText);
  };

  if (!selectedRepId) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          <p className="text-xs font-medium" style={{ color: 'rgba(26,26,26,0.6)' }}>Select a sales rep to chat:</p>
          {salesReps.map(rep => (
            <button
              key={rep.id}
              onClick={() => {
                setSelectedRepId(rep.id);
                setSelectedRepName(rep.full_name);
              }}
              className="w-full text-left p-3 rounded-lg border transition hover:bg-gray-50"
            >
              <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>{rep.full_name}</p>
              <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{rep.email}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Back button and rep name */}
      <div className="border-b p-3 flex items-center gap-2">
        <button
          onClick={() => {
            setSelectedRepId(null);
            setSelectedRepName(null);
          }}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          ← Back
        </button>
        <p className="text-sm font-medium ml-2" style={{ color: '#1A1A1A' }}>{selectedRepName}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>No messages yet</p>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === currentUserId ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-xs px-4 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: msg.sender_id === currentUserId ? '#B8956A' : '#E5E7EB',
                  color: msg.sender_id === currentUserId ? '#FFFBF5' : '#1A1A1A'
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 flex gap-2">
        <Input
          placeholder="Type a message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={sendMessageMutation.isPending}
        />
        <Button
          size="icon"
          onClick={handleSendMessage}
          disabled={!messageText.trim() || sendMessageMutation.isPending}
          style={{ backgroundColor: '#B8956A', color: '#FFFBF5' }}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
}