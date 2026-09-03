import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Video, AlertCircle, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import VideoCallPanelV2 from "@/components/sales/VideoCallPanelV2";
import IncomingVideoCallModal from "@/components/sales/IncomingVideoCallModal";
import ConferenceScheduler from "@/components/chat/ConferenceScheduler";
import { ArrivOneConnectBadge } from "@/components/chat/ArrivOneConnectBadge";
import "@/components/chat/connectChat.css";

export default function AdminChatWindow({ currentUserId, currentUserName }) {
  const [selectedRepId, setSelectedRepId] = useState(null);
  const [selectedRepName, setSelectedRepName] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [salesReps, setSalesReps] = useState([]);
  const [pendingTransfer, setPendingTransfer] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [videoCallError, setVideoCallError] = useState(null);
  const [incomingVideoCall, setIncomingVideoCall] = useState(null);
  const [videoCallProcessing, setVideoCallProcessing] = useState(false);
  const [acceptedIncomingCall, setAcceptedIncomingCall] = useState(null);
  const [showConferenceScheduler, setShowConferenceScheduler] = useState(false);
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

  // Listen for incoming call transfers for the admin
  useEffect(() => {
    if (!currentUserId) return;

    base44.entities.PendingCallTransfer.filter({ to_member_id: currentUserId, status: "pending" })
      .then(records => { if (records?.[0]) setPendingTransfer(records[0]); })
      .catch(() => {});

    const unsubscribe = base44.entities.PendingCallTransfer.subscribe((event) => {
      if (event.type === "create" && event.data?.to_member_id === currentUserId && event.data?.status === "pending") {
        setPendingTransfer(event.data);
      }
      if (event.type === "update" && event.data?.to_member_id === currentUserId && event.data?.status !== "pending") {
        setPendingTransfer(prev => (prev?.id === event.data?.id ? null : prev));
      }
    });
    return unsubscribe;
  }, [currentUserId]);

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

  // Listen for incoming video calls via PendingNotification
  useEffect(() => {
    const unsubscribe = base44.entities.PendingNotification.subscribe((event) => {
      if (event.type === 'create' && event.data?.recipient_id === currentUserId && event.data?.event_type === 'incoming_video_call') {
        const eventData = event.data.event_data;
        console.log('Incoming video call received in AdminChatWindow:', eventData);
        setIncomingVideoCall({
          callerId: eventData.callerId,
          callerName: eventData.callerName,
          callerExtension: eventData.callerExtension,
          recipientId: eventData.recipientId,
          recipientToken: eventData.recipientToken,
          roomName: eventData.roomName
        });
      }
    });

    return unsubscribe;
  }, [currentUserId]);

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

  const acceptTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      // Mark as accepted
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "accepted" });

      // Notify the sender via CustomEvent
      window.dispatchEvent(new CustomEvent('transferStatusUpdate', {
        detail: {
          id: pendingTransfer.id,
          status: 'accepted',
          fromMemberId: pendingTransfer.from_member_id,
          toMemberId: pendingTransfer.to_member_id,
          toMemberExtension: pendingTransfer.to_member_extension,
          toMemberName: selectedRepName,
          callerName: pendingTransfer.caller_name,
          callerNumber: pendingTransfer.caller_number
        }
      }));

      toast.success(`Transfer accepted — waiting for call...`);
    } catch (e) {
      console.error("Failed to accept transfer:", e);
      toast.error("Failed to accept transfer");
    }
    setPendingTransfer(null);
  };

  const declineTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "declined" });

      // Notify the sender via CustomEvent
      window.dispatchEvent(new CustomEvent('transferStatusUpdate', {
        detail: {
          id: pendingTransfer.id,
          status: 'declined',
          fromMemberId: pendingTransfer.from_member_id,
          toMemberId: pendingTransfer.to_member_id,
          toMemberName: selectedRepName
        }
      }));
    } catch (e) {}
    setPendingTransfer(null);
  };

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedRepId) return;
    sendMessageMutation.mutate(messageText);
  };

  if (!selectedRepId) {
    return (
      <div className="flex-1 overflow-y-auto p-4 relative" data-connect-chat="estate_media">
        <div className="connect-bg-orbs">
          <div className="connect-bg-orb" style={{ width: 250, height: 250, top: -40, left: -40, backgroundColor: "#8B5CF6" }} />
          <div className="connect-bg-orb" style={{ width: 200, height: 200, bottom: -30, right: -30, backgroundColor: "#3B82F6" }} />
        </div>
        <div className="relative z-10 glass-header px-4 py-2 mb-3 flex items-center">
          <ArrivOneConnectBadge />
        </div>
        <div className="relative z-10 space-y-2">
          <p className="text-xs font-medium text-slate-500">Select a sales rep to chat:</p>
          {salesReps.map(rep => (
            <button
              key={rep.id}
              onClick={() => {
                setSelectedRepId(rep.id);
                setSelectedRepName(rep.full_name);
              }}
              className="w-full text-left p-3 rounded-lg glass-panel hover:bg-slate-200/40 transition"
            >
              <p className="font-medium text-sm text-slate-900">{rep.full_name}</p>
              <p className="text-xs text-slate-500">{rep.email}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative" data-connect-chat="estate_media">
      <div className="connect-bg-orbs">
        <div className="connect-bg-orb" style={{ width: 250, height: 250, top: -40, left: -40, backgroundColor: "#8B5CF6" }} />
        <div className="connect-bg-orb" style={{ width: 200, height: 200, bottom: -30, right: -30, backgroundColor: "#3B82F6" }} />
      </div>
      <div className="relative z-10 glass-header px-4 py-2 flex items-center">
        <ArrivOneConnectBadge />
      </div>
      {/* Back button, rep name, and action buttons */}
      <div className="glass-header p-3 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedRepId(null);
              setSelectedRepName(null);
            }}
            className="text-sm hover:underline"
            style={{ color: 'var(--chat-accent)' }}
          >
            ← Back
          </button>
          <p className="text-sm font-medium ml-2 text-slate-900">{selectedRepName}</p>
        </div>
        {selectedRepId && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const rep = salesReps.find(r => r.id === selectedRepId);
                if (!rep?.extension) {
                  setVideoCallError('No extension found for video call');
                  setTimeout(() => setVideoCallError(null), 3000);
                  return;
                }
                setShowVideoCall(true);
              }}
              className="p-1.5 text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
              title="Video Call"
            >
              <Video className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowConferenceScheduler(true)}
              className="p-1.5 text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
              title="Schedule Conference"
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Incoming transfer notification */}
      {pendingTransfer && (
        <div className="glass-header p-3 flex items-center justify-between relative z-10" style={{ backgroundColor: 'rgba(239, 246, 255, 0.6)' }}>
          <div>
            <p className="text-sm font-medium text-slate-900">{pendingTransfer.from_member_name} is transferring a call</p>
            <p className="text-xs text-slate-600">From: {pendingTransfer.caller_name || pendingTransfer.caller_number || "Unknown Caller"}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={declineTransfer} variant="outline" className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50">
              Decline
            </Button>
            <Button size="sm" onClick={acceptTransfer} className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white">
              Accept Call
            </Button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 relative z-10">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400">No messages yet. Start the conversation!</p>
        ) : (
          messages.map(msg => {
            const isOutgoing = msg.sender_id === currentUserId;
            return (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${isOutgoing ? 'flex-row-reverse' : ''}`}
            >
              {!isOutgoing && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}>
                  {(msg.sender_name || "?")[0].toUpperCase()}
                </div>
              )}
              <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`} style={{ maxWidth: '75%' }}>
                {!isOutgoing && (
                  <p className="text-xs font-medium text-slate-600 mb-1 px-1">{msg.sender_name}</p>
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm ${isOutgoing ? 'glass-bubble-out rounded-br-md text-white' : 'glass-bubble-in rounded-bl-md text-slate-800'} ${msg.auto_response ? 'italic opacity-75' : ''}`}
                >
                  {msg.content}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 px-1">
                  {formatDistanceToNow(new Date(msg.timestamp || msg.created_date), { addSuffix: true })}
                </p>
              </div>
            </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/40 p-3 flex gap-2 relative z-10">
        <Input
          placeholder="Message"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          disabled={sendMessageMutation.isPending}
          className="glass-input rounded-full border-transparent"
        />
        <Button
          size="icon"
          onClick={handleSendMessage}
          disabled={!messageText.trim() || sendMessageMutation.isPending}
          className="w-10 h-10 rounded-full chat-accent-btn"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      {videoCallError && (
        <div className="border-t border-red-200 p-3 flex items-center gap-2 relative z-10" style={{ backgroundColor: 'rgba(254, 242, 242, 0.6)' }}>
          <AlertCircle className="w-4 h-4 text-red-600" />
          <p className="text-sm text-red-700">{videoCallError}</p>
        </div>
      )}

      {showVideoCall && !acceptedIncomingCall && selectedRepId && (
        <VideoCallPanelV2
          recipientName={selectedRepName}
          recipientExtension={salesReps.find(r => r.id === selectedRepId)?.extension}
          callerToken={null}
          roomName={null}
          currentUserName={currentUserName}
          isVideoWindowOpen={true}
          onMinimize={() => setShowVideoCall(false)}
          onChatOpenRequest={() => {}}
          onClose={() => setShowVideoCall(false)}
        />
      )}

      {incomingVideoCall && (
        <IncomingVideoCallModal
          callerName={incomingVideoCall.callerName}
          callerExtension={incomingVideoCall.callerExtension}
          isProcessing={videoCallProcessing}
          onDecline={() => {
            setIncomingVideoCall(null);
          }}
          onAccept={() => {
            setAcceptedIncomingCall(incomingVideoCall);
            setIncomingVideoCall(null);
            setShowVideoCall(true);
          }}
        />
      )}

      {showVideoCall && acceptedIncomingCall && (
        <VideoCallPanelV2
          recipientName={acceptedIncomingCall.callerName}
          callerToken={acceptedIncomingCall.recipientToken}
          roomName={acceptedIncomingCall.roomName}
          currentUserName={currentUserName}
          isIncoming={true}
          autoStart={true}
          isVideoWindowOpen={true}
          onMinimize={() => setShowVideoCall(false)}
          onChatOpenRequest={() => {}}
          onClose={() => {
            setShowVideoCall(false);
            setAcceptedIncomingCall(null);
          }}
        />
      )}

      {showConferenceScheduler && (
        <ConferenceScheduler
          channelId={null}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserEmail={localStorage.getItem('user_email')}
          transferTargets={salesReps}
          onConferenceCreated={(conference) => {
            toast.success(`Conference "${conference.title}" scheduled!`);
          }}
          onClose={() => setShowConferenceScheduler(false)}
        />
      )}
      </div>
      );
      }