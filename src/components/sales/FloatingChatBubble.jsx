import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import ChatTab from "./ChatTab";
import VideoCallNotificationBanner from "./VideoCallNotificationBanner";
import { ArrivOneConnectBadge } from "@/components/chat/ArrivOneConnectBadge";
import { useCallStatus } from "@/components/CallStatusContext";

// Detect video call invitation messages (content format set in ChatWindow)
const isVideoCallMessage = (content) => {
  if (!content) return false;
  return content.includes("would like to have a video conference with you");
};

const DRAG_THRESHOLD = 6;
const EDGE_PADDING = 8;

// Play a short notification ding (same sound used in ChatWindow)
const playNotificationDing = () => {
  try {
    if (!window.AudioContext && !window.webkitAudioContext) return;
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
  } catch (e) { /* audio not available */ }
};

export default function FloatingChatBubble({ currentUserId, currentUserName, onInitiateTransfer, onVideoCallStarted, isVideoCallActive, onOpenChat, disabled, isInLiveCall, activeVideoCall, isVideoWindowOpen }) {
  const { isInLiveCall: contextIsInLiveCall, remoteCallLive } = useCallStatus();
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);
  const hasInitialized = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [crossAppUnread, setCrossAppUnread] = useState(0);
  const [videoCallBanner, setVideoCallBanner] = useState(null);
  const [pendingChatSelection, setPendingChatSelection] = useState(null);
  const [localRemoteCallLive, setLocalRemoteCallLive] = useState(localStorage.getItem('remoteCallLive') === 'true');

  // ── Drag state ──
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('floatingChatPos');
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    return null;
  });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const btnRef = useRef(null);

  const userId = currentUserId || localStorage.getItem('sales_member_id');
  const userName = currentUserName || localStorage.getItem('sales_member_name');

  const handleToggleChat = () => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    setOpen(!open);
    if (!open) setUnreadCount(0);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const isLive = localStorage.getItem('remoteCallLive') === 'true';
      setLocalRemoteCallLive(isLive);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const loadUnread = async () => {
      try {
        const msgs = await base44.entities.DirectMessage.filter({
          recipient_id: userId,
          read: false
        });
        setUnreadCount(msgs?.length || 0);
      } catch (_) {}
    };

    loadUnread();

    let unsubscribe = () => {};
    try {
      unsubscribe = base44.entities.DirectMessage.subscribe((event) => {
        if (event.type === "create" && event.data?.recipient_id === userId) {
          setUnreadCount(prev => prev + 1);
        }
        if (event.type === "update" && event.data?.recipient_id === userId && event.data?.read) {
          loadUnread();
        }
      });
    } catch (e) {
      console.error('[FloatingChatBubble] DirectMessage subscribe failed:', e);
    }

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cross-app message notification polling ──
  // ChatMessage RLS is admin-only, so we can't use the SDK subscription for
  // non-admin reps. Poll the backend function (bypasses RLS) every 10 seconds
  // for new cross-app messages across ALL channels the user participates in.
  // Tracks the last-seen timestamp in localStorage so only genuinely new
  // messages increment the badge and trigger the sound.
  useEffect(() => {
    const sessionEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    if (!sessionEmail) return;

    const storageKey = 'cross_app_last_seen_ts';
    const getSinceTs = () => localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || null;

    const poll = async () => {
      try {
        const res = await base44.functions.invoke('getCrossAppMessageNotifications', {
          user_email: sessionEmail,
          since_timestamp: getSinceTs(),
        });
        const data = res?.data || res;
        const newCount = data?.count || 0;
        if (newCount > 0) {
          setCrossAppUnread(newCount);
          // Only show the banner, toast, and sound for messages that arrive
          // in real-time (after the initial page-load poll). The first poll
          // on page load only updates the badge count without triggering
          // notifications, so refreshing the page doesn't re-fire the banner
          // for messages that arrived while the user was away.
          if (hasInitialized.current) {
            playNotificationDing();
            const newMessages = data?.messages || [];
            const videoCallMsg = newMessages.find(m => isVideoCallMessage(m.content));
            if (videoCallMsg) {
              setVideoCallBanner({
                senderName: videoCallMsg.sender_name || 'Unknown',
                senderRole: 'Arriv One',
                message: videoCallMsg.content,
                senderEmail: videoCallMsg.sender_email || '',
              });
            }
          }
          // Advance the watermark so already-notified messages don't re-trigger
          const latestTs = data?.latest_message?.timestamp || data?.latest_message?.created_date;
          if (latestTs) {
            const store = localStorage.getItem('sales_member_id') ? localStorage : sessionStorage;
            store.setItem(storageKey, latestTs);
          }
        }
      } catch (e) {
        // Silent — polling will retry
      } finally {
        hasInitialized.current = true;
      }
    };

    // Initialize watermark to now on first ever load so we don't badge
    // every historical message as unread.
    if (!getSinceTs()) {
      const now = new Date().toISOString();
      const store = localStorage.getItem('sales_member_id') ? localStorage : sessionStorage;
      store.setItem(storageKey, now);
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  // When chat panel opens, reset cross-app badge and advance watermark to now
  useEffect(() => {
    if (open) {
      setCrossAppUnread(0);
      const storageKey = 'cross_app_last_seen_ts';
      const store = localStorage.getItem('sales_member_id') ? localStorage : sessionStorage;
      store.setItem(storageKey, new Date().toISOString());
    }
  }, [open]);

  // When chat panel opens, mark all unread DirectMessages as read so the
  // badge doesn't reappear with the same count after a page refresh.
  useEffect(() => {
    if (open && userId) {
      setUnreadCount(0);
      (async () => {
        try {
          await base44.entities.DirectMessage.updateMany(
            { recipient_id: userId, read: false },
            { $set: { read: true } }
          );
        } catch (_) { /* silent */ }
      })();
    }
  }, [open, userId]);

  const displayCount = open ? 0 : (unreadCount + crossAppUnread);

  // ── Drag handlers ──
  const clampPos = useCallback((x, y) => {
    const size = 56;
    const maxX = window.innerWidth - size - EDGE_PADDING;
    const maxY = window.innerHeight - size - EDGE_PADDING;
    return {
      x: Math.min(Math.max(x, EDGE_PADDING), maxX),
      y: Math.min(Math.max(y, EDGE_PADDING), maxY),
    };
  }, []);

  const onPointerDown = (e) => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    let startPos = pos;
    if (!startPos) {
      const size = 56;
      startPos = {
        x: window.innerWidth - size - 16,
        y: window.innerHeight - size - 16,
      };
      setPos(startPos);
    }
    dragging.current = true;
    dragMoved.current = false;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: startPos.x,
      posY: startPos.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      dragMoved.current = true;
    }
    const next = clampPos(dragStart.current.posX + dx, dragStart.current.posY + dy);
    setPos(next);
  };

  const onPointerUp = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (dragMoved.current) {
      setPos(prev => {
        localStorage.setItem('floatingChatPos', JSON.stringify(prev));
        return prev;
      });
    } else {
      handleToggleChat();
    }
  };

  const hidden = (disabled || isInLiveCall || isVideoWindowOpen);
  const hideOffset = (isInLiveCall || localRemoteCallLive);

  const btnStyle = hidden
    ? { bottom: '-500px', right: '1rem' }
    : pos
      ? { left: `${pos.x}px`, top: `${pos.y}px` }
      : { bottom: '1rem', right: '1rem' };

  // Panel: cream/gold transparent backdrop. Opens next to the bubble's current position.
  const panelWidth = Math.min(700, window.innerWidth - 16);
  const panelHeight = 560;
  const bubbleSize = 56;
  const panelMargin = 8;

  let bubbleX, bubbleY;
  if (pos) {
    bubbleX = pos.x;
    bubbleY = pos.y;
  } else {
    bubbleX = window.innerWidth - bubbleSize - 16;
    bubbleY = window.innerHeight - bubbleSize - 16;
  }

  // Panel's bottom-right corner sits at the center of the bubble
  let panelLeft = bubbleX + bubbleSize / 2 - panelWidth;
  let panelTop = bubbleY + bubbleSize / 2 - panelHeight;
  panelLeft = Math.max(panelMargin, Math.min(panelLeft, window.innerWidth - panelWidth - panelMargin));
  panelTop = Math.max(panelMargin, Math.min(panelTop, window.innerHeight - panelHeight - panelMargin));

  const panelStyle = {
    height: `${panelHeight}px`,
    width: `${panelWidth}px`,
    maxWidth: '95vw',
    background: 'rgba(255, 251, 245, 0.88)',
    border: '1px solid rgba(184, 149, 106, 0.3)',
    zIndex: 9000,
    left: `${panelLeft}px`,
    top: `${panelTop}px`,
    transform: hideOffset ? 'translateY(700px)' : 'translateY(0)',
    opacity: hideOffset ? 0 : 1,
    transition: 'transform 0.3s ease, opacity 0.3s ease',
  };

  return (
    <div>
      {/* Video Call Notification Banner — top-right card */}
      <VideoCallNotificationBanner
        notification={videoCallBanner}
        onOpenChat={() => {
          if (videoCallBanner?.senderEmail) {
            setPendingChatSelection({
              type: 'cross_app_dm',
              id: videoCallBanner.senderEmail,
              name: videoCallBanner.senderName,
            });
          }
          setOpen(true);
        }}
        onDismiss={() => setVideoCallBanner(null)}
      />

      {/* Floating Chat Panel — Arriv One Connect */}
      {open && (
        <div
          className="fixed rounded-xl shadow-2xl overflow-hidden"
          style={panelStyle}
        >
          {/* Close button — floats above the Connect badge bar */}
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 z-50 w-8 h-8 rounded-full bg-[#B8956A]/20 hover:bg-[#B8956A]/40 text-[#2a3536] flex items-center justify-center transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
          {/* ChatTab fills the panel — it carries the Connect badge + data-connect-chat theming */}
          <div className="h-full">
            <ChatTab
              currentUserId={userId}
              currentUserName={userName}
              onInitiateTransfer={onInitiateTransfer}
              onVideoCallStarted={onVideoCallStarted}
              autoSelectChat={pendingChatSelection}
              onAutoSelectConsumed={() => setPendingChatSelection(null)}
            />
          </div>
        </div>
      )}

      {/* Bubble Button — draggable via pointer events */}
      <button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.preventDefault()}
        className="fixed w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 select-none"
        style={{
          ...btnStyle,
          zIndex: 9000,
          backgroundColor: '#B8956A',
          opacity: hidden ? 0.5 : 1,
          pointerEvents: hidden ? 'none' : 'auto',
          cursor: hidden ? 'not-allowed' : (dragging.current ? 'grabbing' : 'grab'),
          touchAction: 'none',
        }}
      >
        <MessageSquare className="w-6 h-6 text-white pointer-events-none" />

        {displayCount > 0 && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white pointer-events-none"
            style={{ backgroundColor: '#ef4444', minWidth: '1.25rem' }}
          >
            {displayCount > 9 ? '9+' : displayCount}
          </span>
        )}
      </button>
    </div>
  );
}