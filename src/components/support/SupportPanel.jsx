#2563EB → your brand color; "Arriv Support" label → your support label; closed-state copy as desired. The logic must NOT change.
import React, { useState, useRef, useEffect } from "react";
import { X, Minus, Send, Loader2, CheckCircle2, AlertTriangle, ArrowUpCircle, MessageCircle, Download, RefreshCw, UserPlus } from "lucide-react";
import { useSupport } from "./SupportProvider";
import AgentAvatar from "./AgentAvatar";

const REPAIR_STATE_META = {
  checking: { label: "Checking…", icon: Loader2, spin: true, color: "text-slate-500" },
  found: { label: "Found the issue", icon: AlertTriangle, spin: false, color: "text-amber-600" },
  repairing: { label: "Attempting repair", icon: Loader2, spin: true, color: "text-blue-600" },
  verifying: { label: "Verifying", icon: Loader2, spin: true, color: "text-blue-600" },
  fixed: { label: "Fixed", icon: CheckCircle2, spin: false, color: "text-green-600" },
  resolved: { label: "Resolved", icon: CheckCircle2, spin: false, color: "text-green-600" },
  needs_approval: { label: "Needs approval", icon: ArrowUpCircle, spin: false, color: "text-amber-600" },
  escalating: { label: "Escalating", icon: AlertTriangle, spin: false, color: "text-red-600" },
  failed: { label: "Failed", icon: AlertTriangle, spin: false, color: "text-red-600" },
  none: null,
};

function RepairBadge({ state }) {
  const meta = REPAIR_STATE_META[state];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.color}`}>
      <Icon className={`w-3.5 h-3.5 ${meta.spin ? "animate-spin" : ""}`} />
      {meta.label}
    </span>
  );
}

// Transcript block — renders the canonical transcript lifecycle state.
// Shown in BOTH active and closed conversation states so the customer never
// loses the download link. Transcript state outranks reset: pending state
// keeps the completion visible until the URL arrives or generation fails.
function TranscriptBlock({ transcriptUrl, transcriptStatus, transcriptRequested, transcriptReady, onReset }) {
  // Failed — truthful message, allow reset/close
  if (transcriptStatus === "failed") {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-slate-500">We couldn't prepare the transcript right now.</p>
        {onReset && (
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-sm text-[#2563EB] font-medium hover:bg-[#2563EB]/5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Start a new conversation
          </button>
        )}
      </div>
    );
  }

  // Ready with URL — show download link
  if (transcriptUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 text-center">Your transcript is ready.</p>
        <a
          href__={transcriptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mx-auto max-w-[85%] px-4 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] transition-colors"
        >
          <Download className="w-4 h-4" />
          Download transcript
        </a>
      </div>
    );
  }

  // Pending — customer accepted but generation still in progress
  if (transcriptRequested || transcriptStatus === "preparing") {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
        <p className="text-sm text-slate-600">Preparing your transcript...</p>
      </div>
    );
  }

  // Offered but not yet accepted — no action needed, the agent message handles it
  return null;
}

export default function SupportPanel() {
  const { open, setOpen, available, loading, sending, connecting, agentTyping, conversation, messages, transferState, closed, closureReason, transcriptUrl, transcriptStatus, transcriptOffered, transcriptRequested, transcriptReady, customerContext, submitIssue, sendUserMessage, resetConversation, requestClose, cancelClose, endChat, showCloseConfirm, closing } = useSupport();
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, connecting, agentTyping]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const hasConversation = !!conversation;
  const showIntake = available && !loading && !hasConversation && !connecting && !closed;
  const showChat = available && (hasConversation || connecting) && !closed;
  const showClosed = available && closed;

  const handleSend = () => {
    if (!input.trim() || sending || connecting) return;
    const text = input.trim();
    setInput("");
    if (!hasConversation) {
      submitIssue(text);
    } else {
      sendUserMessage(text);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Arriv Assist support chat"
      className="fixed z-[70] inset-x-0 bottom-0 md:inset-x-auto md:bottom-6 md:left-6 md:w-[400px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      style={{ maxHeight: "85vh", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#2563EB] text-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0">
            {hasConversation ? (
              <AgentAvatar
                avatarUrl={conversation?.agent_avatar_url}
                avatarInitial={conversation?.agent_avatar_initial || "A"}
                className="w-9 h-9 flex items-center justify-center font-semibold"
                fallbackClassName="bg-white/20"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-semibold">
                <MessageCircle className="w-5 h-5" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {hasConversation ? `${conversation?.agent_name} — Arriv Support` : "Arriv Support"}
            </p>
            <p className="text-xs text-white/80 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${available ? "bg-green-300" : "bg-red-300"}`} />
              {available ? (connecting ? "Connecting..." : "Online") : "Temporarily unavailable"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setOpen(false)} aria-label="Minimize" className="p-1.5 rounded hover:bg-white/20">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={requestClose} aria-label="Close" className="p-1.5 rounded hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Close confirmation overlay — distinct from minimize */}
      {showCloseConfirm && (
        <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center px-6 py-8 space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-base font-semibold text-slate-800">End this chat?</p>
            <p className="text-sm text-slate-500">
              If you close this chat, your current support conversation will end. You can start a new chat anytime if you need more help.
            </p>
          </div>
          <div className="flex flex-col w-full max-w-[260px] gap-2">
            <button
              onClick={cancelClose}
              disabled={closing}
              className="px-4 py-2.5 rounded-xl bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
            >
              Keep Chat Open
            </button>
            <button
              onClick={endChat}
              disabled={closing}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              End Chat
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div ref__={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
        {/* Unavailable */}
        {!available && !loading && (
          <div className="text-center text-sm text-slate-500 py-8">
            Arriv Support is temporarily unavailable. Please try again shortly.
          </div>
        )}

        {/* Loading (initial) */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {/* Intake form — no conversation yet */}
        {showIntake && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-[#2563EB]/10 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-6 h-6 text-[#2563EB]" />
              </div>
              <p className="text-base font-medium text-slate-800 mb-1">
                {customerContext?.preferred_name
                  ? `Hi ${customerContext.preferred_name}, how can we help you today?`
                  : "How can we help you today?"}
              </p>
              <p className="text-sm text-slate-500">Describe the issue you're seeing and we'll connect you to a support agent.</p>
            </div>
          </div>
        )}

        {/* Connecting state — hidden when typing indicator is showing */}
        {connecting && !agentTyping && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
            <p className="text-sm text-slate-600 text-center">
              Thank you. Connecting you to a support agent...
            </p>
          </div>
        )}

        {/* Chat messages */}
        {showChat && messages.map((m) => {
          // System messages (manager join events) — centered, muted, with join icon
          if (m.role === "system") {
            return (
              <div key={m.id} className="flex justify-center">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs">
                  <UserPlus className="w-3 h-3" />
                  <span>{m.content}</span>
                </div>
              </div>
            );
          }
          return (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${m.role === "user" ? "bg-[#2563EB] text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              {m.repair_state && m.repair_state !== "none" && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-200/50">
                  <RepairBadge state={m.repair_state} />
                </div>
              )}
              {m.ticket_number && (
                <p className={`mt-1 text-xs font-medium ${m.role === "user" ? "text-white/80" : "text-slate-500"}`}>
                  Ticket: {m.ticket_number}
                </p>
              )}
            </div>
          </div>
          );
        })}

        {/* Transfer state — canonical manager transfer in progress */}
        {showChat && transferState && transferState.toUpperCase() !== "NONE" && transferState.toUpperCase() !== "COMPLETED" && !closed && (
          <div className="flex justify-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#2563EB]/5 border border-[#2563EB]/20 text-[#2563EB] text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Connecting you with a support manager...</span>
            </div>
          </div>
        )}

        {/* Typing indicator — shown even while sending, so "Agent is typing..."
            appears immediately after the customer sends a message */}
        {showChat && agentTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
              <p className="text-xs text-slate-500 italic">
                {conversation?.agent_name || "Agent"} is typing...
              </p>
            </div>
          </div>
        )}

        {/* Sending indicator — hidden when typing indicator is showing */}
        {sending && !closed && !agentTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          </div>
        )}

        {/* Transcript block — shown in active chat when transcript is offered/pending/ready.
            Not gated on closed state so the customer sees the download link as soon as
            Assist provides it, even before the conversation becomes CLOSED. */}
        {showChat && (transcriptUrl || transcriptRequested || transcriptStatus === "preparing" || transcriptStatus === "failed") && (
          <div className="py-2">
            <TranscriptBlock
              transcriptUrl={transcriptUrl}
              transcriptStatus={transcriptStatus}
              transcriptRequested={transcriptRequested}
              transcriptReady={transcriptReady}
            />
          </div>
        )}

        {/* Closed / completion state — canonical lifecycle completion */}
        {showClosed && (
          <div className="space-y-4 py-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <p className="text-base font-medium text-slate-800">Your support conversation has ended</p>
              <p className="text-sm text-slate-500">
                {closureReason === "INACTIVITY"
                  ? "This conversation was closed due to inactivity."
                  : closureReason === "CUSTOMER_ENDED"
                  ? (customerContext?.preferred_name
                    ? `Thanks for chatting with Arriv Support, ${customerContext.preferred_name}. If you need anything else, just start a new chat anytime.`
                    : "Thanks for chatting with Arriv Support. If you need anything else, just start a new chat anytime.")
                  : "Thank you for contacting Arriv Support."}
              </p>
            </div>
            <TranscriptBlock
              transcriptUrl={transcriptUrl}
              transcriptStatus={transcriptStatus}
              transcriptRequested={transcriptRequested}
              transcriptReady={transcriptReady}
              onReset={resetConversation}
            />
            <button
              onClick={resetConversation}
              className="flex items-center justify-center gap-2 mx-auto px-4 py-2 text-sm text-[#2563EB] font-medium hover:bg-[#2563EB]/5 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Start a new conversation
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-slate-200 bg-white">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={showIntake ? "Describe the issue..." : "Type your message..."}
            rows={1}
            aria-label="Type your support message"
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] max-h-28"
            disabled={!available || sending || connecting || loading || closed}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || connecting || !available || loading || closed}
            aria-label="Send message"
            className="p-2.5 rounded-xl bg-[#2563EB] text-white disabled:opacity-40 hover:bg-[#1D4ED8] transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

