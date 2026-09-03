import React, { useState, useRef, useCallback, useEffect } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { useSupport } from "./SupportProvider";
import AgentAvatar from "./AgentAvatar";

const DRAG_THRESHOLD = 6; // px — movement below this counts as a click
const EDGE_PADDING = 8; // px — keep button fully on-screen
const BTN_SIZE = 56; // w-14 h-14

export default function SupportBubble() {
  const { open, setOpen, startSupport, available, conversation, messages } = useSupport();

  // ── Drag state (hooks must run before any early return) ──
  // Position stored as { x, y } px from top-left. Default = bottom-left.
  const [pos, setPos] = useState(() => {
    const saved = localStorage.getItem('arrivAssistPos');
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    return null; // null = use default bottom-left via CSS
  });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  const clampPos = useCallback((x, y) => {
    const maxX = window.innerWidth - BTN_SIZE - EDGE_PADDING;
    const maxY = window.innerHeight - BTN_SIZE - EDGE_PADDING;
    return {
      x: Math.min(Math.max(x, EDGE_PADDING), maxX),
      y: Math.min(Math.max(y, EDGE_PADDING), maxY),
    };
  }, []);

  // Re-clamp on viewport resize so the button stays on-screen
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos(prev => prev ? clampPos(prev.x, prev.y) : prev);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos, clampPos]);

  // ── Early returns (after all hooks) ──
  // Don't render on marketing/auth pages — adjust these routes for your app
  const path = window.location.pathname;
  if (path === "/ClientSignup" || path === "/MediaPartnerSignup" || path === "/ContractorSignup") return null;

  if (open) return null; // panel shows instead

  const agentInitial = conversation?.agent_avatar_initial || "A";

  const onPointerDown = (e) => {
    // Initialize default position (bottom-left, matching original CSS) on first interaction
    let startPos = pos;
    if (!startPos) {
      startPos = {
        x: 24, // md:left-6 = 24px
        y: window.innerHeight - BTN_SIZE - 24,
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
        localStorage.setItem('arrivAssistPos', JSON.stringify(prev));
        return prev;
      });
    } else {
      // Treat as a click — open Arriv Assist
      startSupport();
    }
  };

  const btnStyle = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px` }
    : {
        bottom: '1rem',
        left: '1rem',
        marginBottom: "env(safe-area-inset-bottom)",
        marginLeft: "env(safe-area-inset-left)",
      };

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.preventDefault()}
      aria-label="Open Arriv Assist support"
      className="fixed z-[60] flex items-center justify-center w-14 h-14 rounded-full bg-[#B8956A] text-white shadow-lg hover:bg-[#A68559] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8956A] focus-visible:ring-offset-2 select-none"
      style={{ ...btnStyle, cursor: 'grab', touchAction: 'none' }}
    >
      {!available ? (
        <LifeBuoy className="w-6 h-6 opacity-60 pointer-events-none" />
      ) : conversation ? (
        <>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white z-10 pointer-events-none" aria-hidden="true" />
          <AgentAvatar
            avatarUrl={conversation?.agent_avatar_url}
            avatarInitial={agentInitial}
            className="w-full h-full flex items-center justify-center text-xl font-semibold pointer-events-none"
          />
        </>
      ) : (
        <>
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white pointer-events-none" aria-hidden="true" />
          <MessageCircle className="w-6 h-6 pointer-events-none" />
        </>
      )}
    </button>
  );
}