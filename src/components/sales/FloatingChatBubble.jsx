import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MessageSquare, X } from "lucide-react";
import ChatTab from "./ChatTab";
import { useCallStatus } from "@/components/CallStatusContext";

const DRAG_THRESHOLD = 6; // px — movement below this counts as a click
const EDGE_PADDING = 8; // px — keep button fully on-screen

export default function FloatingChatBubble({ currentUserId, currentUserName, onInitiateTransfer, onVideoCallStarted, isVideoCallActive, onOpenChat, disabled, isInLiveCall, activeVideoCall, isVideoWindowOpen }) {
  const { isInLiveCall: contextIsInLiveCall, remoteCallLive } = useCallStatus();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [localRemoteCallLive, setLocalRemoteCallLive] = useState(localStorage.getItem('remoteCallLive') === 'true');

  // ── Drag state ──
  // Position is stored as { x, y } in pixels from top-left of the viewport.
  // Defaults to bottom-right (matches the original fixed placement).
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('floatingChatPos');
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    return null; // null = use default bottom-right until measured
  });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const btnRef = useRef(null);

  // Resolve from localStorage immediately so we don't wait for async prop
  const userId = currentUserId || localStorage.getItem('sales_member_id');
  const userName = currentUserName || localStorage.getItem('sales_member_name');

  const handleToggleChat = () => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    setOpen(!open);
    if (!open) setUnreadCount(0);
  };

  useEffect(() => {
    // Listen for remoteCallLive changes
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

    const unsubscribe = base44.entities.DirectMessage.subscribe((event) => {
      if (event.type === "create" && event.data?.recipient_id === userId) {
        setUnreadCount(prev => prev + 1);
      }
      if (event.type === "update" && event.data?.recipient_id === userId && event.data?.read) {
        loadUnread();
      }
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When opened, don't show badge
  const displayCount = open ? 0 : unreadCount;

  // ── Drag handlers ──
  const clampPos = useCallback((x, y) => {
    const size = 56; // w-14 h-14 = 56px
    const maxX = window.innerWidth - size - EDGE_PADDING;
    const maxY = window.innerHeight - size - EDGE_PADDING;
    return {
      x: Math.min(Math.max(x, EDGE_PADDING), maxX),
      y: Math.min(Math.max(y, EDGE_PADDING), maxY),
    };
  }, []);

  const onPointerDown = (e) => {
    if (disabled || isInLiveCall || isVideoWindowOpen) return;
    // Initialize default position (bottom-right) on first interaction
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
      // Persist position so it survives reloads
      setPos(prev => {
        localStorage.setItem('floatingChatPos', JSON.stringify(prev));
        return prev;
      });
    } else {
      // Treat as a click — toggle the chat
      handleToggleChat();
    }
  };

  const hidden = (disabled || isInLiveCall || isVideoWindowOpen);
  const hideOffset = (isInLiveCall || localRemoteCallLive);

  // Compute button position style: custom drag position, or default bottom-right
  const btnStyle = hidden
    ? { bottom: '-500px', right: '1rem' }
    : pos
      ? { left: `${pos.x}px`, top: `${pos.y}px` }
      : { bottom: '1rem', right: '1rem' };

  // Chat panel stays anchored bottom-right (not dragged) for consistent UX
  const panelStyle = {
    height: '520px',
    backgroundColor: '#fff',
    borderColor: 'rgba(184,149,106,0.3)',
    zIndex: 9000,
    bottom: hideOffset ? '-600px' : '5rem',
    right: '1rem',
  };

  return (
    <div>
      {/* Floating Chat Panel */}
      {open && (
         <div
          className="fixed w-[700px] max-w-[95vw] rounded-xl shadow-2xl border overflow-hidden transition-all"
          style={panelStyle}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(184,149,106,0.2)' }}>
            <span className="text-sm font-semibold text-white">Team Chat</span>
            <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div style={{ height: 'calc(100% - 40px)' }}>
            <ChatTab
              currentUserId={userId}
              currentUserName={userName}
              onInitiateTransfer={onInitiateTransfer}
              onVideoCallStarted={onVideoCallStarted}
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
        onClick={(e) => e.preventDefault()} // prevent double-toggle; pointerup handles click
        className="fixed w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-105 select-none"
        style={{
          ...btnStyle,
          zIndex: 9000,
          backgroundColor: '#B8956A',
          opacity: hidden ? 0.5 : 1,
          pointerEvents: hidden ? 'none' : 'auto',
          cursor: hidden ? 'not-allowed' : (dragging.current ? 'grabbing' : 'grab'),
          touchAction: 'none', // allow pointer drag on touch without scrolling
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