import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Paperclip, Smile, X, MessageCircle, Trash2, Phone, Video, AlertCircle, Calendar } from "lucide-react";
import AiAssistButton from "./AiAssistButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import MessageReactions from "./MessageReactions";
import ThreadPanel from "./ThreadPanel";
import ChatContactCard from "./ChatContactCard";
import ContactCardDisplay from "./ContactCardDisplay";
import ContactSearch from "./ContactSearch";
import SalesRepProfileModal from "./SalesRepProfileModal";
import TransferCallButton from "./TransferCallButton";
import VideoCallPanelV2 from "./VideoCallPanelV2";
import IncomingVideoCallModal from "./IncomingVideoCallModal";
import ConferenceScheduler from "@/components/chat/ConferenceScheduler";

const EMOJIS = ["😀","😂","😍","🥰","😎","🤔","👍","👎","❤️","🔥","🎉","✅","😅","🙏","💪","😢","😡","🤣","👀","💯","🚀","⭐","😊","🤝","👏"];

// Deterministic cross-app DM channel ID (must match backend crossAppChat.ts)
const generateCrossAppChannelId = (emailA, emailB) => {
  const a = (emailA || "").toLowerCase().trim();
  const b = (emailB || "").toLowerCase().trim();
  const sorted = [a, b].sort();
  return `cross_app_dm:${sorted[0]}:${sorted[1]}`;
};

const STATUS_COLORS = {
  online: "#22c55e", available: "#22c55e", busy: "#ef4444",
  in_meeting: "#f97316", away: "#eab308", lunch: "#a855f7",
  break: "#3b82f6", offline: "#6b7280"
};

const playDing = () => {
  try {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
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


export default function ChatWindow({ chatType, chatId, chatName, currentUserId, currentUserName, currentUserEmail, memberProfiles = {}, memberStatuses = {}, onInitiateTransfer, onVideoCallStarted, onVideoCallEnded }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [contactToEdit, setContactToEdit] = useState(null);
  const [profileMemberId, setProfileMemberId] = useState(null);
  const [messageKeywords, setMessageKeywords] = useState({});
  const [pendingTransfer, setPendingTransfer] = useState(null);
  const [sentTransferStatus, setSentTransferStatus] = useState(null);
  const [transferTargets, setTransferTargets] = useState([]);
  const [showTransferSelector, setShowTransferSelector] = useState(false);
  const [videoCallError, setVideoCallError] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [videoCallTarget, setVideoCallTarget] = useState(null);
  const [outgoingCallData, setOutgoingCallData] = useState(null);
  const [incomingVideoCall, setIncomingVideoCall] = useState(null);
  const [videoCallProcessing, setVideoCallProcessing] = useState(false);
  const [acceptedIncomingCall, setAcceptedIncomingCall] = useState(null);
  const [showConferenceScheduler, setShowConferenceScheduler] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  // Listen for incoming call transfers — show inline in chat
  useEffect(() => {
    if (!currentUserId) return;

    // Check for existing pending transfers
    base44.entities.PendingCallTransfer.filter({ to_member_id: currentUserId, status: "pending" })
      .then(records => { if (records?.[0]) setPendingTransfer(records[0]); })
      .catch(() => {});

    let unsubscribe = () => {};
    try {
      unsubscribe = base44.entities.PendingCallTransfer.subscribe((event) => {
        if (event.type === "create" && event.data?.to_member_id === currentUserId && event.data?.status === "pending") {
          setPendingTransfer(event.data);
        }
        if (event.type === "update" && event.data?.to_member_id === currentUserId && event.data?.status !== "pending") {
          setPendingTransfer(prev => (prev?.id === event.data?.id ? null : prev));
        }
      });
    } catch (e) {
      console.error('[ChatWindow] PendingCallTransfer subscribe failed:', e);
    }
    return unsubscribe;
  }, [currentUserId]);

  // Listen for transfer status updates via CustomEvent (from AdminChatWindow)
  useEffect(() => {
    const handleTransferStatusUpdate = (e) => {
      const detail = e.detail;
      if (detail?.fromMemberId === currentUserId) {
        setSentTransferStatus({
          id: detail.id,
          status: detail.status,
          toName: detail.toMemberName,
          callerName: detail.callerName || detail.callerNumber
        });
        
        // Auto-dismiss after 5 seconds if accepted or declined
        if (detail.status !== 'pending') {
          setTimeout(() => setSentTransferStatus(null), 5000);
        }
      }
    };
    
    window.addEventListener('transferStatusUpdate', handleTransferStatusUpdate);
    return () => window.removeEventListener('transferStatusUpdate', handleTransferStatusUpdate);
  }, [currentUserId]);

  // Listen for incoming video calls via PendingNotification
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = base44.entities.PendingNotification.subscribe((event) => {
      if (event.type === 'create' && event.data?.recipient_id === currentUserId && event.data?.event_type === 'incoming_video_call') {
        const eventData = event.data.event_data;
        console.log('Incoming video call received in ChatWindow:', eventData);
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
    } catch (e) {
      console.error('[ChatWindow] PendingNotification subscribe failed:', e);
    }

    return unsubscribe;
  }, [currentUserId]);

  const acceptTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      console.log('Accepting transfer:', pendingTransfer.id);

      // 1. Mark as accepted
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "accepted" });

      // 2. Get the sender's active call SID (from dialer)
      const senderCallSid = window._senderCallSid;
      if (!senderCallSid) {
        toast.error("Sender is not on an active call");
        return;
      }

      // 3. Redirect sender's call to conference via backend
      const response = await base44.functions.invoke('acceptCallTransfer', {
        transferId: pendingTransfer.id,
        recipientMemberId: currentUserId,
        senderMemberId: pendingTransfer.from_member_id,
        originalCallerPhone: pendingTransfer.caller_number,
        callerName: pendingTransfer.caller_name,
        senderCallSid: senderCallSid
      });

      if (response.data?.success) {
        console.log('Transfer initiated — recipient call being placed');
        toast.success(`Connecting ${pendingTransfer.from_member_name}...`);
      } else {
        toast.error("Transfer setup failed");
      }
    } catch (e) {
      console.error('Transfer accept error:', e);
      toast.error("Failed to accept transfer: " + e.message);
    }
    setPendingTransfer(null);
  };

  const declineTransfer = async () => {
    if (!pendingTransfer) return;
    try {
      await base44.entities.PendingCallTransfer.update(pendingTransfer.id, { status: "declined" });
    } catch (e) {}
    setPendingTransfer(null);
  };

  // Request / check notification permission
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(p => {
        if (p === "granted") setNotificationsEnabled(true);
      });
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleOpenContact = (e) => {
      setContactToEdit(e.detail);
      setShowContactSearch(true);
    };
    window.addEventListener('openContactSearch', handleOpenContact);
    return () => window.removeEventListener('openContactSearch', handleOpenContact);
  }, []);

  useEffect(() => {
    base44.entities.SalesTeamMember.filter({ is_active: true }).then(members => {
      setTransferTargets(members || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!chatId) return;

    const loadMessages = async () => {
      setLoading(true);
      if (chatType === "channel") {
          const msgs = await base44.entities.ChatMessage.filter({ channel_id: chatId, parent_message_id: null }, "timestamp", 50);
          setMessages(msgs);
      } else if (chatType === "cross_app_dm") {
        const channelId = generateCrossAppChannelId(currentUserEmail, chatId);
        const msgs = await base44.entities.ChatMessage.filter({ cross_app_channel_id: channelId, parent_message_id: null }, "timestamp", 50);
        setMessages(msgs);
      } else if (chatType === "dm") {
        const msgs = await base44.entities.DirectMessage.filter(
          { $or: [
            { sender_id: currentUserId, recipient_id: chatId, parent_message_id: null },
            { sender_id: chatId, recipient_id: currentUserId, parent_message_id: null }
          ] },
          "timestamp",
          50
        );

        // Also load cross-app messages if the recipient is Arriv One-linked.
        // This unifies the conversation so messages from both apps appear in one
        // logical DM thread. The recipient's email is used to compute the
        // deterministic cross-app channel ID (same convention as the backend).
        let crossAppMsgs = [];
        if (currentUserEmail) {
          try {
            const recipientMembers = await base44.entities.SalesTeamMember.filter({ id: chatId });
            const recipientEmail = recipientMembers?.[0]?.email;
            if (recipientEmail) {
              const crossAppChannelId = generateCrossAppChannelId(currentUserEmail, recipientEmail);
              crossAppMsgs = await base44.entities.ChatMessage.filter(
                { cross_app_channel_id: crossAppChannelId, parent_message_id: null, origin_app: "arriv_one" },
                "timestamp", 50
              );
            }
          } catch (e) {
            console.error('Cross-app message load error:', e);
          }
        }

        // Merge and sort by timestamp
        const allMsgs = [...msgs, ...crossAppMsgs].sort((a, b) =>
          new Date(a.timestamp || a.created_date) - new Date(b.timestamp || b.created_date)
        );
        setMessages(allMsgs);

        // Mark local messages as read
        msgs.forEach(msg => {
          if (msg.recipient_id === currentUserId && !msg.read) {
            base44.entities.DirectMessage.update(msg.id, { read: true });
          }
        });
      }
      setLoading(false);
    };

    loadMessages();

    // Subscribe to real-time updates
    const crossAppChannelId = chatType === "cross_app_dm" ? generateCrossAppChannelId(currentUserEmail, chatId) : null;
    let unsubscribeCrossApp = null;
    let unsubscribe = () => {};
    try {
      unsubscribe = (chatType === "channel" || chatType === "cross_app_dm")
        ? base44.entities.ChatMessage.subscribe((event) => {
          const matches = chatType === "cross_app_dm"
            ? event.data?.cross_app_channel_id === crossAppChannelId
            : event.data?.channel_id === chatId;
          if (matches) {
            if (event.type === "create") {
              // Only show main messages in channel (filter out thread replies)
              if (!event.data?.parent_message_id) {
                setMessages(prev => {
                  const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-') || m.sender_id !== currentUserId || m.content !== event.data.content);
                  return [...withoutOptimistic, event.data];
                });
                if (event.data?.sender_id !== currentUserId) {
                  playDing();
                  toast.message(chatType === "cross_app_dm" ? (event.data?.sender_name || chatName) : `#${chatName}`, {
                    description: `${event.data?.sender_name}: ${event.data?.content}`,
                  });
                  if (Notification.permission === "granted") {
                    try {
                      new Notification(`#${chatName}`, {
                        body: `${event.data?.sender_name}: ${event.data?.content}`,
                        icon: "/favicon.ico",
                        tag: `channel-${chatId}`
                      });
                    } catch (e) {}
                  }
                }
              } else if (event.data?.parent_message_id) {
                // Update thread reply count on parent message
                setMessages(prev => prev.map(m => {
                  if (m.id === event.data.parent_message_id) {
                    return {
                      ...m,
                      thread_reply_count: (m.thread_reply_count || 0) + 1
                    };
                  }
                  return m;
                }));
              }
            } else if (event.type === "update") {
              // Update reactions on messages
              setMessages(prev => prev.map(m => m.id === event.data.id ? event.data : m));
              if (selectedThread?.id === event.data.id) {
                setSelectedThread(event.data);
              }
            }
          }
        })
      : base44.entities.DirectMessage.subscribe((event) => {
          if ((event.data?.sender_id === currentUserId || event.data?.recipient_id === currentUserId) &&
              (event.data?.sender_id === chatId || event.data?.recipient_id === chatId)) {
            if (event.type === "create") {
              // Only show main messages (filter out thread replies)
              if (!event.data?.parent_message_id) {
                setMessages(prev => {
                  const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-') || m.sender_id !== currentUserId || m.content !== event.data.content);
                  return [...withoutOptimistic, event.data];
                });
                if (event.data?.sender_id !== currentUserId) {
                  playDing();
                  toast.message(event.data?.sender_name, {
                    description: event.data?.content,
                  });
                  if (Notification.permission === "granted") {
                    try {
                      new Notification(event.data?.sender_name, {
                        body: event.data?.content,
                        icon: "/favicon.ico",
                        tag: `dm-${event.data?.sender_id}`
                      });
                    } catch (e) {}
                  }
                }
              } else if (event.data?.parent_message_id) {
                // Update thread reply count on parent message
                setMessages(prev => prev.map(m => {
                  if (m.id === event.data.parent_message_id) {
                    return {
                      ...m,
                      thread_reply_count: (m.thread_reply_count || 0) + 1
                    };
                  }
                  return m;
                }));
              }
            } else if (event.type === "update") {
              // Update reactions on messages
              setMessages(prev => prev.map(m => m.id === event.data.id ? event.data : m));
              if (selectedThread?.id === event.data.id) {
                setSelectedThread(event.data);
              }
            }
          }
        });
    } catch (e) {
      console.error('[ChatWindow] message subscribe failed:', e);
    }

    // For "dm" chatType, also subscribe to cross-app ChatMessage events so
    // inbound Arriv One messages appear in the unified local DM conversation.
    if (chatType === "dm" && currentUserEmail) {
      (async () => {
        try {
          const members = await base44.entities.SalesTeamMember.filter({ id: chatId });
          const recipientEmail = members?.[0]?.email;
          if (!recipientEmail) return;
          const dmCrossAppChannelId = generateCrossAppChannelId(currentUserEmail, recipientEmail);
          unsubscribeCrossApp = base44.entities.ChatMessage.subscribe((event) => {
            if (event.data?.cross_app_channel_id !== dmCrossAppChannelId) return;
            if (event.data?.parent_message_id) return;
            if (event.data?.origin_app !== "arriv_one") return;
            if (event.type === "create") {
              setMessages(prev => {
                const withoutOptimistic = prev.filter(m => !m.id.startsWith('temp-') || m.sender_id !== currentUserId || m.content !== event.data.content);
                return [...withoutOptimistic, event.data].sort((a, b) =>
                  new Date(a.timestamp || a.created_date) - new Date(b.timestamp || b.created_date)
                );
              });
              if (event.data?.sender_id !== currentUserId) {
                playDing();
                toast.message(event.data?.sender_name, { description: event.data?.content });
              }
            }
          });
        } catch (e) {
          console.error('Cross-app subscription error:', e);
        }
      })();
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeCrossApp) unsubscribeCrossApp();
    };
  }, [chatId, chatType, currentUserId, currentUserEmail]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const isImage = file.type.startsWith("image/");
      const content = isImage ? `[image]${file_url}` : `[file|${file.name}]${file_url}`;
      const optimisticMsg = {
        id: `temp-${Date.now()}`,
        sender_id: currentUserId,
        sender_name: currentUserName,
        content,
        timestamp: new Date().toISOString(),
        ...(chatType === "channel" ? { channel_id: chatId } : { recipient_id: chatId, recipient_name: chatName }),
      };
      setMessages(prev => [...prev, optimisticMsg]);
      if (chatType === "channel") {
        await base44.entities.ChatMessage.create({ channel_id: chatId, sender_id: currentUserId, sender_name: currentUserName, content, timestamp: new Date().toISOString() });
      } else if (chatType === "cross_app_dm") {
        await base44.functions.invoke('sendCrossAppChatMessage', {
          recipient_email: chatId,
          content,
          sender_name: currentUserName,
          sender_email: currentUserEmail,
        });
      } else {
        await base44.entities.DirectMessage.create({ sender_id: currentUserId, sender_name: currentUserName, recipient_id: chatId, recipient_name: chatName, content, timestamp: new Date().toISOString() });
        const fileRecipient = transferTargets.find(m => m.id === chatId);
        if (fileRecipient?.email && (fileRecipient.arriv_employee_id || fileRecipient.sync_source === "arriv_one" || fileRecipient.immutable_shared_id)) {
          try {
            await base44.functions.invoke('sendCrossAppChatMessage', {
              recipient_email: fileRecipient.email,
              content,
              sender_name: currentUserName,
              sender_email: currentUserEmail,
            });
          } catch (e) {
            console.error("Cross-app file propagation failed:", e);
          }
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
    }
    setUploading(false);
    e.target.value = "";
  };

  const renderMessageContent = (content, isOutgoing = false) => {
    if (!content) return null;
    if (content.startsWith("[contact]")) {
      return <ContactCardDisplay content={content} />;
    }
    if (content.startsWith("[image]")) {
      const url = content.slice(7);
      return <img src={url} alt="shared" className="max-w-[220px] max-h-[180px] rounded-lg mt-1 cursor-pointer" onClick={() => window.open(url, '_blank')} />;
    }
    if (content.startsWith("[file|")) {
      const match = content.match(/^\[file\|(.+?)\](.+)$/);
      if (match) {
        return <a href={match[2]} target="_blank" rel="noopener noreferrer" className="underline text-sm mt-1 block" style={{ color: 'var(--chat-accent)' }}>📎 {match[1]}</a>;
      }
    }
    return <p className={`text-sm mt-1 break-words ${isOutgoing ? 'text-white' : 'text-slate-800'}`}>{content}</p>;
  };

  const handleDeleteMessage = async (messageId, messageType) => {
    try {
      // Detect cross-app messages merged into a "dm" view: they have
      // cross_app_channel_id or channel_id (ChatMessage entity), not recipient_id.
      const msg = messages.find(m => m.id === messageId);
      const isChatMessage = messageType === "channel" || messageType === "cross_app_dm" ||
        (msg && (msg.cross_app_channel_id || msg.channel_id));
      if (isChatMessage) {
        await base44.entities.ChatMessage.delete(messageId);
      } else {
        await base44.entities.DirectMessage.delete(messageId);
      }
      setMessages(prev => prev.filter(m => m.id !== messageId));
      toast.success("Message deleted");
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");
    }
  };

  const handleSendMessage = async (e) => {
    if (e.key && e.key !== "Enter") return;
    if (e.key === "Enter" && (e.shiftKey || e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const text = newMessage.trim();
     if (!text) return;

    // Optimistic update
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      sender_id: currentUserId,
      sender_name: currentUserName,
      content: text,
      timestamp: new Date().toISOString(),
      ...(chatType === "channel"
        ? { channel_id: chatId }
        : chatType === "cross_app_dm"
          ? { cross_app_channel_id: generateCrossAppChannelId(currentUserEmail, chatId) }
          : { recipient_id: chatId, recipient_name: chatName }),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setNewMessage("");

    try {
      if (chatType === "channel") {
        await base44.entities.ChatMessage.create({
          channel_id: chatId,
          sender_id: currentUserId,
          sender_name: currentUserName,
          content: text,
          timestamp: new Date().toISOString(),
          reactions: {}
        });
      } else if (chatType === "cross_app_dm") {
        const res = await base44.functions.invoke('sendCrossAppChatMessage', {
          recipient_email: chatId,
          content: text,
          sender_name: currentUserName,
          sender_email: currentUserEmail,
        });
        if (res?.data && !res.data.delivered && res.data.delivery_error) {
          toast.error(`Not delivered to Arriv One: ${res.data.delivery_error}`);
        }
      } else if (chatType === "dm") {
        await base44.entities.DirectMessage.create({
          sender_id: currentUserId,
          sender_name: currentUserName,
          recipient_id: chatId,
          recipient_name: chatName,
          content: text,
          timestamp: new Date().toISOString(),
          reactions: {}
        });

        // If the recipient is an Arriv One-linked employee, also propagate the
        // message cross-app so it appears in the Arriv One ChatTab. The local
        // DirectMessage remains for the Estate Media view; the cross-app
        // ChatMessage (origin_app="estate_media") is filtered out of the unified
        // DM view to avoid duplicates (only inbound origin_app="arriv_one"
        // messages are shown from the cross-app store).
        const dmRecipient = transferTargets.find(m => m.id === chatId);
        if (dmRecipient?.email && (dmRecipient.arriv_employee_id || dmRecipient.sync_source === "arriv_one" || dmRecipient.immutable_shared_id)) {
          try {
            await base44.functions.invoke('sendCrossAppChatMessage', {
              recipient_email: dmRecipient.email,
              content: text,
              sender_name: currentUserName,
              sender_email: currentUserEmail,
            });
          } catch (e) {
            console.error("Cross-app propagation failed:", e);
          }
        }

       // Send auto-response if recipient is in a meeting
       if (memberStatuses[chatId] === 'in_meeting') {
         setTimeout(async () => {
           try {
             await base44.entities.DirectMessage.create({
               sender_id: chatId,
               sender_name: chatName,
               recipient_id: currentUserId,
               recipient_name: currentUserName,
               content: "This person is in a meeting and will respond as soon as they're available.",
               timestamp: new Date().toISOString(),
               auto_response: true
             });
           } catch (e) {
             console.error("Error sending auto-response:", e);
           }
         }, 500);
       }
     }
   } catch (error) {
     console.error("Error sending message:", error);
     // Remove optimistic message on failure
     setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
     setNewMessage(text);
   }
  };

  if (showContactSearch) {
    return (
      <div className="flex flex-col h-full glass-chat">
        <div className="glass-header p-4 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => setShowContactSearch(false)} className="mr-2">
            <X className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-semibold text-gray-900">Contact Details</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <ContactSearch
            salesMemberId={currentUserId}
            openNewContactForm={true}
            setOpenNewContactForm={() => {}}
            prefilledData={contactToEdit}
            onFormClosed={() => setShowContactSearch(false)}
          />
        </div>
      </div>
    );
  }

  // Cross-app DM recipient — look up the synced SalesTeamMember by email to get extension + id
  const crossAppRecipient = chatType === "cross_app_dm"
    ? transferTargets.find(m => m.email?.toLowerCase() === chatId?.toLowerCase())
    : null;

  if (!chatId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Select a conversation to start messaging
      </div>
    );
  }

  if (selectedThread) {
     return (
       <ThreadPanel
         parentMessage={selectedThread}
         channelId={chatId}
         currentUserId={currentUserId}
         currentUserName={currentUserName}
         onClose={() => setSelectedThread(null)}
         memberProfiles={memberProfiles}
         chatType={chatType}
         recipientId={chatId}
       />
     );
   }

  return (
    <>
    <div className="flex flex-col h-full glass-chat">
      {/* Header */}
      <div className="glass-header h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {chatType === "dm" ? (
            <>
              <button
                className="text-lg font-semibold text-slate-900 hover:text-[var(--chat-accent)] hover:underline transition-colors"
                onClick={() => setProfileMemberId(chatId)}
              >
                {chatName}
              </button>
              {memberStatuses[chatId] && (
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[memberStatuses[chatId]] || "#6b7280" }} />
              )}
              {transferTargets.find(m => m.id === chatId)?.extension && (
                    <>
                      <button
                       onClick={() => {
                         const ext = transferTargets.find(m => m.id === chatId)?.extension;
                         if (ext) {
                           if (onInitiateTransfer) {
                             onInitiateTransfer(chatId, chatName);
                           } else {
                             localStorage.setItem('dialerPhone', String(ext));
                             window.dispatchEvent(new Event('dialerCardReady'));
                           }
                         }
                       }}
                       className="p-1.5 text-gray-600 hover:text-[#B8956A] hover:bg-gray-100 rounded-lg transition"
                       title="Call"
                      >
                       <Phone className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ext = transferTargets.find(m => m.id === chatId)?.extension;
                          if (!ext) {
                            setVideoCallError('No extension found for video call');
                            setTimeout(() => setVideoCallError(null), 3000);
                            return;
                          }
                          try {
                            const res = await base44.functions.invoke('initiateVideoCall', {
                              salesMemberId: currentUserId,
                              recipientExtension: String(ext),
                              callerName: currentUserName
                            });
                            if (res.data?.success) {
                              const callData = { roomName: res.data.roomName, token: res.data.caller.token, recipientName: chatName };
                              if (onVideoCallStarted) {
                                // Pass full data to parent so it renders the panel at page level (survives chat bubble hiding)
                                onVideoCallStarted(callData);
                              } else {
                                // Fallback: render locally if no parent handler
                                setOutgoingCallData(callData);
                                setShowVideoCall(true);
                              }
                            } else {
                              setVideoCallError('Failed to start video call');
                              if (onVideoCallEnded) onVideoCallEnded('failed');
                              setTimeout(() => setVideoCallError(null), 3000);
                            }
                          } catch (err) {
                            setVideoCallError('Failed to start video call: ' + err.message);
                            if (onVideoCallEnded) onVideoCallEnded('error');
                            setTimeout(() => setVideoCallError(null), 4000);
                          }
                        }}
                        className="p-1.5 text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
                        title="Video Call"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                    </>
                    )}
                    </>
                    ) : chatType === "cross_app_dm" ? (
                    <>
                    <h2 className="text-lg font-semibold text-slate-900">{chatName}</h2>
                    {crossAppRecipient?.extension && (
                      <>
                       <button
                         onClick={() => {
                           const ext = crossAppRecipient?.extension;
                           if (ext) {
                             localStorage.setItem('dialerPhone', String(ext));
                             window.dispatchEvent(new Event('dialerCardReady'));
                           }
                         }}
                         className="p-1.5 text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
                         title="Call"
                       >
                         <Phone className="w-4 h-4" />
                       </button>
                       <button
                         onClick={async () => {
                           if (!crossAppRecipient) return;
                           try {
                             const res = await base44.functions.invoke('initiateCrossTenantVideoCall', {
                               salesMemberId: currentUserId,
                               recipientMemberId: crossAppRecipient.id,
                             });
                             if (res.data?.success) {
                               const callData = { roomName: res.data.roomName, token: res.data.caller.token, recipientName: chatName };
                               if (onVideoCallStarted) {
                                 onVideoCallStarted(callData);
                               } else {
                                 setOutgoingCallData(callData);
                                 setShowVideoCall(true);
                               }
                             } else {
                               setVideoCallError('Failed to start cross-tenant video call');
                               setTimeout(() => setVideoCallError(null), 3000);
                             }
                           } catch (err) {
                             setVideoCallError('Failed to start video call: ' + err.message);
                             setTimeout(() => setVideoCallError(null), 4000);
                           }
                         }}
                         className="p-1.5 text-slate-600 hover:text-[var(--chat-accent)] hover:bg-slate-100 rounded-lg transition"
                         title="Video Call"
                       >
                         <Video className="w-4 h-4" />
                       </button>
                      </>
                    )}
                    </>
                    ) : (
                    <h2 className="text-lg font-semibold text-slate-900">#{chatName}</h2>
                    )}
                    <button
                      onClick={() => setShowConferenceScheduler(true)}
                      className="p-1.5 text-gray-600 hover:text-[#B8956A] hover:bg-gray-100 rounded-lg transition"
                      title="Schedule Conference"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
        </div>

      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center text-slate-400 text-sm">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-400 text-sm">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg) => {
            const profileUrl = memberProfiles[msg.sender_id];
            const initials = (msg.sender_name || "?")[0].toUpperCase();
            const isOutgoing = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isOutgoing ? 'flex-row-reverse' : ''}`}>
                {!isOutgoing && (
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: 'var(--chat-accent)', color: 'var(--chat-on-accent)' }}>
                      {profileUrl ? (
                        <img src={profileUrl} alt={msg.sender_name} className="w-full h-full object-cover" />
                      ) : initials}
                    </div>
                    {memberStatuses[msg.sender_id] && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                        style={{ backgroundColor: STATUS_COLORS[memberStatuses[msg.sender_id]] || "#6b7280" }} />
                    )}
                  </div>
                )}
                <div className={`flex flex-col ${isOutgoing ? 'items-end' : 'items-start'}`} style={{ maxWidth: '75%' }}>
                   {!isOutgoing && (
                     <button
                       className="text-xs font-medium text-slate-600 hover:underline transition-colors mb-1 px-1"
                       onClick={() => setProfileMemberId(msg.sender_id)}
                     >
                       {msg.sender_name}
                     </button>
                    )}
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${isOutgoing ? 'glass-bubble-out rounded-br-md text-white' : 'glass-bubble-in rounded-bl-md text-slate-800'}`}>
                      {renderMessageContent(msg.content, isOutgoing)}
                    </div>
                    <span className={`text-[10px] text-slate-400 mt-1 px-1 ${isOutgoing ? 'text-right' : ''}`}>
                      {formatDistanceToNow(new Date(msg.timestamp || msg.created_date), { addSuffix: true })}
                    </span>
                  <div className="flex flex-wrap gap-2 items-center mt-1.5">
                    <MessageReactions 
                      message={msg}
                      currentUserId={currentUserId}
                      messageType={chatType}
                      onReactionUpdate={() => {
                        // Reload messages to show updated reactions
                        setMessages(prev => [...prev]);
                      }}
                    />
                    {onInitiateTransfer && msg.sender_id !== currentUserId && (
                       <button
                         onClick={() => {
                           if (chatType === "dm") {
                             onInitiateTransfer(msg.sender_id, msg.sender_name);
                           } else {
                             setShowTransferSelector(true);
                           }
                         }}
                         className="text-xs text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                         title="Transfer to contact"
                       >
                         📞 Transfer
                       </button>
                     )}
                    {msg.sender_id === currentUserId && (
                      <button
                        onClick={() => handleDeleteMessage(msg.id, chatType)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                        title="Delete message"
                      >
                        <Trash2 className="w-3 h-3" />
                        Undo
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedThread(msg)}
                      className="text-xs hover:underline flex items-center gap-1" style={{ color: 'var(--chat-accent)' }}
                    >
                      <MessageCircle className="w-3 h-3" />
                      {msg.thread_reply_count > 0 ? `${msg.thread_reply_count} ${msg.thread_reply_count === 1 ? 'reply' : 'replies'}` : 'Reply in thread'}
                    </button>
                  </div>
                  </div>
                  </div>
                  );
                  })
                  )}
                  {/* Incoming transfer — shown inline like the sender's Transfer button */}
                  {pendingTransfer && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 text-xs font-bold">📞</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-gray-900">{pendingTransfer.from_member_name}</span>
                          <span className="text-xs text-gray-500">just now</span>
                        </div>
                        <p className="text-gray-700 text-sm mt-1">
                          wants to transfer a call from <strong>{pendingTransfer.caller_name || pendingTransfer.caller_number || "Unknown Caller"}</strong> to you
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            onClick={declineTransfer}
                            variant="outline"
                            className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            onClick={acceptTransfer}
                            className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white"
                          >
                            Accept Call
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Transfer status feedback for sender */}
                  {sentTransferStatus && (
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        sentTransferStatus.status === 'accepted' ? 'bg-green-100' : 'bg-red-100'
                      }`}>
                        <span className={sentTransferStatus.status === 'accepted' ? 'text-green-600 text-xs font-bold' : 'text-red-600 text-xs font-bold'}>
                          {sentTransferStatus.status === 'accepted' ? '✓' : '✕'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-700 text-sm">
                          {sentTransferStatus.status === 'accepted' ? (
                            <>
                              <strong>{sentTransferStatus.toName}</strong> accepted the transfer of <strong>{sentTransferStatus.callerName}</strong>
                            </>
                          ) : (
                            <>
                              <strong>{sentTransferStatus.toName}</strong> declined the transfer
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                  </div>

      {/* Input */}
      <div className="border-t border-white/40 p-3 relative">
        {showEmojis && (
          <div className="absolute bottom-full left-0 mb-2 glass-panel rounded-xl p-2 flex flex-wrap gap-1 w-64 z-10">
            {EMOJIS.map(emoji => (
              <button key={emoji} type="button" className="text-xl hover:bg-gray-100 rounded p-1"
                onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojis(false); }}>
                {emoji}
              </button>
            ))}
          </div>
        )}
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.txt,.xlsx,.csv" />
        <div className="flex items-center gap-1 mb-1.5">
          <AiAssistButton
            mode="chat"
            context={{
              recipientName: chatName,
              recentMessages: messages.slice(-6),
              repName: currentUserName
            }}
            onInsert={(text) => setNewMessage(text)}
          />
        </div>
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <ChatContactCard
            channelId={chatId}
            chatId={chatId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            onContactAdded={() => {}}
            chatType={chatType}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-slate-400 hover:text-[var(--chat-accent)] transition-colors p-1 flex-shrink-0">
            <Paperclip className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setShowEmojis(v => !v)}
            className="text-slate-400 hover:text-[var(--chat-accent)] transition-colors p-1 flex-shrink-0">
            <Smile className="w-5 h-5" />
          </button>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleSendMessage}
            placeholder={uploading ? "Uploading..." : "Message"}
            className="flex-1 glass-input rounded-full px-4 py-2.5 text-sm border-transparent"
            disabled={uploading}
          />
          <Button type="submit" size="icon" className="w-10 h-10 rounded-full chat-accent-btn" disabled={uploading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>

      <SalesRepProfileModal
         memberId={profileMemberId}
         open={!!profileMemberId}
         onClose={() => setProfileMemberId(null)}
         onCallClick={(memberId, memberName) => {
           if (onInitiateTransfer) {
             onInitiateTransfer(memberId, memberName);
           } else {
             // Fallback: use dialerCardReady flow
             base44.entities.SalesTeamMember.filter({ id: memberId }).then(members => {
               const ext = members?.[0]?.extension;
               if (ext) {
                 localStorage.setItem('_dialerPhone', String(ext));
                 localStorage.setItem('_dialerTab', 'keypad');
                 window.dispatchEvent(new CustomEvent('initiateTransfer', {
                   detail: { extension: String(ext), name: memberName }
                 }));
               }
             }).catch(() => {});
           }
           setProfileMemberId(null);
         }}
       />

       {showTransferSelector && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-lg p-6 w-full max-w-sm">
             <h3 className="font-semibold text-lg mb-4">Transfer to Contact</h3>
             <div className="space-y-2 max-h-60 overflow-y-auto">
               {transferTargets.filter(m => m.id !== currentUserId && m.extension).map(member => (
                 <button
                   key={member.id}
                   onClick={() => {
                     window.dispatchEvent(new CustomEvent('initiateTransfer', { 
                       detail: { extension: String(member.extension), name: member.full_name }
                     }));
                     setShowTransferSelector(false);
                   }}
                   className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition border border-gray-200"
                 >
                   <p className="font-medium text-gray-900">{member.full_name}</p>
                   <p className="text-xs text-gray-500">Ext. {member.extension}</p>
                 </button>
               ))}
             </div>
             <button
               onClick={() => setShowTransferSelector(false)}
               className="mt-4 w-full p-2 text-sm text-gray-600 hover:text-gray-900 border rounded-lg"
             >
               Cancel
             </button>
           </div>
         </div>
       )}

       {videoCallError && (
          <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm text-red-700">{videoCallError}</p>
          </div>
        )}

        {/* Outgoing video call */}
        {showVideoCall && !acceptedIncomingCall && outgoingCallData && (
           <VideoCallPanelV2
             recipientName={outgoingCallData.recipientName}
             callerToken={outgoingCallData.token}
             roomName={outgoingCallData.roomName}
             currentUserName={currentUserName}
             autoStart={true}
             isVideoWindowOpen={showVideoCall}
             onMinimize={() => setShowVideoCall(false)}
             onClose={() => {
               setShowVideoCall(false);
               setOutgoingCallData(null);
               if (onVideoCallEnded) onVideoCallEnded('user_ended');
             }}
           />
         )}

        {/* Incoming video call notification */}
        {incomingVideoCall && (
          <IncomingVideoCallModal
            callerName={incomingVideoCall.callerName}
            callerExtension={incomingVideoCall.callerExtension}
            isProcessing={videoCallProcessing}
            onDecline={() => setIncomingVideoCall(null)}
            onAccept={() => {
              if (onVideoCallStarted) onVideoCallStarted('accepting');
              setAcceptedIncomingCall(incomingVideoCall);
              setIncomingVideoCall(null);
              setShowVideoCall(true);
            }}
          />
        )}

        {/* Accepted incoming call */}
        {showVideoCall && acceptedIncomingCall && (
          <VideoCallPanelV2
            recipientName={acceptedIncomingCall.callerName}
            callerToken={acceptedIncomingCall.recipientToken}
            roomName={acceptedIncomingCall.roomName}
            currentUserName={currentUserName}
            isIncoming={true}
            autoStart={true}
            isVideoWindowOpen={showVideoCall}
            onMinimize={() => setShowVideoCall(false)}
            onClose={() => {
              setShowVideoCall(false);
              setAcceptedIncomingCall(null);
              if (onVideoCallEnded) onVideoCallEnded('user_ended');
            }}
          />
        )}

        {showConferenceScheduler && (
          <ConferenceScheduler
            channelId={chatId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserEmail={localStorage.getItem('sales_member_email')}
            transferTargets={transferTargets}
            onConferenceCreated={(conference) => {
              toast.success(`Conference "${conference.title}" scheduled!`);
            }}
            onClose={() => setShowConferenceScheduler(false)}
          />
        )}
        </>
        );
        }