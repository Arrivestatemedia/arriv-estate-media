import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare, ArrowLeft } from "lucide-react";

const playIphoneTextSound = () => {
  try {
    const ctx = window._unlockedAudioCtx;
    if (!ctx || ctx.state === 'suspended') return;

    const playTone = (freq, startTime, duration, gainVal) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playTone(1318, ctx.currentTime, 0.12, 0.3);
    playTone(1174, ctx.currentTime + 0.13, 0.12, 0.3);
    playTone(987, ctx.currentTime + 0.26, 0.18, 0.3);
  } catch (e) {}
};

export default function SmsInbox({ salesMemberId }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Load conversations
  useEffect(() => {
    loadConversations();
    let unsub = () => {};
    try {
      unsub = base44.entities.SmsConversation.subscribe((event) => {
        const isInbound = event.type === 'create' || 
          (event.type === 'update' && event.data?.last_message_direction === 'inbound');
        if (isInbound) {
          playIphoneTextSound();
          // Browser notification
          if (Notification.permission === 'granted') {
            const name = event.data?.contact_name || event.data?.from_number || 'Unknown';
            const body = event.data?.last_message || 'New text message';
            new Notification(`📱 Text from ${name}`, { body, tag: `sms-${event.id}` });
          }
        }
        loadConversations();
      });
    } catch (e) {
      console.error('[SmsInbox] SmsConversation subscribe failed:', e);
    }
    return unsub;
  }, []);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConvo) return;
    loadMessages(selectedConvo.id);

    // Mark as read
    base44.entities.SmsConversation.update(selectedConvo.id, { unread_count: 0 });

    let unsub = () => {};
    try {
      unsub = base44.entities.SmsMessage.subscribe((event) => {
        if (event.data?.conversation_id === selectedConvo.id) {
          loadMessages(selectedConvo.id);
        }
      });
    } catch (e) {
      console.error('[SmsInbox] SmsMessage subscribe failed:', e);
    }
    return unsub;
  }, [selectedConvo?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    const data = await base44.entities.SmsConversation.list('-last_message_at');
    setConversations(data);
  };

  const loadMessages = async (convoId) => {
    const data = await base44.entities.SmsMessage.filter({ conversation_id: convoId }, 'created_date');
    setMessages(data);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedConvo) return;
    setSending(true);
    try {
      await base44.functions.invoke('sendSms', {
        conversationId: selectedConvo.id,
        toNumber: selectedConvo.from_number,
        body: replyText.trim()
      });
      setReplyText("");
      await loadMessages(selectedConvo.id);
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (selectedConvo) {
    return (
      <div className="flex flex-col min-h-screen md:h-[500px] md:max-h-[500px]">
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <Button variant="ghost" size="icon" onClick={() => setSelectedConvo(null)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <p className="font-semibold" style={{ color: '#1A1A1A' }}>
              {selectedConvo.contact_name || selectedConvo.from_number}
            </p>
            <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{selectedConvo.from_number}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-[120px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[75%] rounded-2xl px-4 py-2 text-sm"
                style={
                  msg.direction === 'outbound'
                    ? { backgroundColor: '#B8956A', color: '#fff' }
                    : { backgroundColor: '#f3f4f6', color: '#1A1A1A' }
                }
              >
                <p>{msg.body}</p>
                <p className="text-xs mt-1 opacity-60">{formatTime(msg.created_date)}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply box */}
        <div className="flex gap-2 pt-3 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <Input
            placeholder="Type a message..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendReply()}
          />
          <Button
            onClick={sendReply}
            disabled={sending || !replyText.trim()}
            style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.length === 0 && (
        <div className="text-center py-10" style={{ color: 'rgba(26,26,26,0.4)' }}>
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No text messages yet</p>
          <p className="text-xs mt-1">Incoming texts will appear here</p>
        </div>
      )}
      {conversations.map((convo) => (
        <button
          key={convo.id}
          onClick={() => setSelectedConvo(convo)}
          className="w-full text-left p-3 rounded-xl border hover:border-[#B8956A] transition-all"
          style={{ borderColor: 'rgba(184,149,106,0.2)', backgroundColor: '#fff' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>
                  {convo.contact_name || convo.from_number}
                </p>
                {convo.unread_count > 0 && (
                  <span className="text-xs font-bold text-white rounded-full px-1.5 py-0.5" style={{ backgroundColor: '#B8956A' }}>
                    {convo.unread_count}
                  </span>
                )}
              </div>
              <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(26,26,26,0.5)' }}>
                {convo.last_message}
              </p>
            </div>
            <p className="text-xs ml-3 shrink-0" style={{ color: 'rgba(26,26,26,0.4)' }}>
              {formatTime(convo.last_message_at)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}