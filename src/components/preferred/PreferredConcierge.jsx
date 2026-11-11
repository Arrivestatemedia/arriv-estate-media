import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  Crown,
  Loader2,
  Minus,
  Send,
  Sparkles,
  UserRound,
  Video,
  X,
} from "lucide-react";
import {
  askConcierge,
  confirmConciergeAction,
  endConciergeVideo,
  endConciergeVideoOnLeave,
  fetchConciergeNotices,
  markConciergeNotice,
  startConciergeVideo,
} from "@/lib/conciergeClient";
import { applyConciergeDirective } from "@/lib/conciergeUi";
import { usePreferredSurface } from "@/components/preferred/surface/PreferredSurfaceContext";
import ConciergeResultCard from "@/components/preferred/ConciergeResultCard";
import ConciergeVideoPanel from "@/components/preferred/ConciergeVideoPanel";

const SESSION_KEY = "arriv_concierge_session_id";
const CONVO_KEY = "arriv_concierge_conversation_id";

function read(key) {
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — the conversation simply does not persist */
  }
}

export default function PreferredConcierge({ customer, entitlement }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { open: openSurface } = usePreferredSurface();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [sessionId, setSessionId] = useState(() => read(SESSION_KEY));
  const [conversationId, setConversationId] = useState(() => read(CONVO_KEY));
  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoIssue, setVideoIssue] = useState("");
  const [videoChecklist, setVideoChecklist] = useState([]);

  const firstName = String(customer?.first_name || customer?.full_name || "").split(" ")[0];

  useEffect(() => {
    setMessages((current) => (current.length ? current : [{
      role: "concierge",
      text: `${firstName ? `${firstName}, ` : ""}I'm your Arriv concierge. Tell me what you need and I'll handle it — your shoots, property pages, galleries, billing or marketing.`,
    }]));
  }, [firstName]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending, videoUrl]);

  // A live video is never left running: closing the page, reloading or the tab going away
  // all end the Tavus conversation on the server.
  useEffect(() => {
    if (!videoUrl) return undefined;
    const leave = () => {
      endConciergeVideoOnLeave();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [videoUrl]);

  const loadNotices = useCallback(async (refresh) => {
    setNoticesLoading(true);
    try {
      const result = await fetchConciergeNotices(refresh ? "refresh" : "list");
      setNotices(Array.isArray(result?.notices) ? result.notices : []);
    } catch {
      setNotices([]);
    } finally {
      setNoticesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadNotices(false);
  }, [open, loadNotices]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(async (text) => {
    const utterance = String(text || "").trim();
    if (!utterance || busy) return;
    setDraft("");
    setShowNotices(false);
    setMessages((current) => [...current, { role: "customer", text: utterance }]);
    setBusy(true);
    setPending(null);
    try {
      const result = await askConcierge({
        utterance,
        sessionId,
        conversationId,
        channel: videoUrl ? "video" : "text",
        context: { page: location.pathname, listing_id: new URLSearchParams(location.search).get("jobId") || "" },
      });

      if (result?.session_id) {
        setSessionId(result.session_id);
        write(SESSION_KEY, result.session_id);
      }
      if (result?.conversation_id) {
        setConversationId(result.conversation_id);
        write(CONVO_KEY, result.conversation_id);
      }

      setMessages((current) => [...current, {
        role: "concierge",
        text: result?.reply || "I'm here. What would you like to do next?",
        actions: Array.isArray(result?.actions) ? result.actions : [],
      }]);

      if (result?.pending_action) setPending(result.pending_action);
      if (result?.ui) applyConciergeDirective(result.ui, { open: openSurface, navigate });
    } catch (error) {
      const status = Number(error?.status || error?.response?.status);
      setMessages((current) => [...current, {
        role: "system",
        text: status === 403
          ? "The concierge is part of your Preferred membership. Your portal is still fully available."
          : "I couldn't reach Arriv just now. Nothing was changed on your account — please try again.",
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, location.pathname, location.search, navigate, openSurface, sessionId, videoUrl]);

  const decide = useCallback(async (decision) => {
    if (!pending?.action_record_id) return;
    const current = pending;
    setPending(null);
    setBusy(true);
    try {
      const result = await confirmConciergeAction({
        actionRecordId: current.action_record_id,
        decision,
      });
      setMessages((list) => [...list, {
        role: "concierge",
        text: result?.reply || (decision === "decline" ? "No changes were made." : "Done."),
      }]);
      if (result?.ok && result?.ui) applyConciergeDirective(result.ui, { open: openSurface, navigate });
      if (decision === "confirm") loadNotices(true);
    } catch {
      setMessages((list) => [...list, {
        role: "system",
        text: "That request could not be completed. Nothing was changed on your account.",
      }]);
    } finally {
      setBusy(false);
    }
  }, [loadNotices, navigate, openSurface, pending]);

  const startVideo = useCallback(async () => {
    if (videoBusy || videoUrl) return;
    setVideoBusy(true);
    setVideoIssue("");
    setVideoChecklist([]);
    try {
      const result = await startConciergeVideo(sessionId);
      if (result?.ok && result?.conversation_url) {
        setVideoUrl(result.conversation_url);
        if (result.session_id) {
          setSessionId(result.session_id);
          write(SESSION_KEY, result.session_id);
        }
      } else {
        setVideoIssue(result?.message || "The video concierge is unavailable right now.");
        setVideoChecklist(Array.isArray(result?.checklist) ? result.checklist : []);
      }
    } catch {
      setVideoIssue("The video concierge is unavailable right now. The text concierge still works.");
    } finally {
      setVideoBusy(false);
    }
  }, [sessionId, videoBusy, videoUrl]);

  const stopVideo = useCallback(async () => {
    setVideoUrl("");
    try {
      await endConciergeVideo(sessionId);
    } catch {
      /* ending the frame is enough; the session expires on its own */
    }
  }, [sessionId]);

  const clearConversation = useCallback(() => {
    setMessages([{
      role: "concierge",
      text: `${firstName ? `${firstName}, ` : ""}Fresh start. What would you like me to handle?`,
    }]);
    setPending(null);
    setSessionId(null);
    setConversationId(null);
    write(SESSION_KEY, null);
    write(CONVO_KEY, null);
  }, [firstName]);

  const unread = notices.filter((notice) => !notice.read).length;

  async function openNotice(notice) {
    if (!notice.read) {
      markConciergeNotice(notice.notice_id, "read").catch(() => null);
      setNotices((list) => list.map((item) => (item.notice_id === notice.notice_id ? { ...item, read: true } : item)));
    }
    setShowNotices(false);
    if (notice.action_hint === "open_gallery") await send(`Open the gallery for ${notice.body}`);
    else if (notice.action_hint === "list_invoices") await send("Show me my outstanding invoices");
    else if (notice.action_hint === "list_bookings") await send("Show me my upcoming shoots");
    else if (notice.action_hint === "get_property_performance") await send("How many people viewed my properties this month?");
    else await send(notice.title);
  }

  if (!open) {
    return (
      <div className="preferred-dock">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="preferred-dock-surface preferred-focus flex items-center gap-2.5 px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
          aria-label="Open Arriv Concierge"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#c8a87c]/15">
            <Crown className="h-4 w-4 text-[#d9bd95]" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#d9bd95]" />
            )}
          </span>
          <span>
            <span className="block text-[13px] leading-tight text-[#f6f1e8]">Arriv Concierge</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]/80">Preferred</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="preferred-dock">
      <div
        className="preferred-dock-surface flex h-[min(78vh,620px)] w-[min(94vw,392px)] flex-col overflow-hidden"
        role="dialog"
        aria-label="Arriv Concierge"
      >
        <div className="flex items-start justify-between gap-2 border-b border-[#c8a87c]/20 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.24em] text-[#c8a87c]">
              <Crown className="h-3.5 w-3.5" />
              {entitlement?.plan ? String(entitlement.plan).replace(/_/g, " ") : "Preferred"}
            </p>
            <h2 className="preferred-gold-text font-serif text-lg leading-tight">Arriv Concierge</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setShowNotices((value) => !value); if (!showNotices) loadNotices(true); }}
              className="preferred-focus relative rounded-full p-1.5 text-[#f6f1e8]/60 hover:bg-[#c8a87c]/10 hover:text-[#f6f1e8]"
              aria-label="Concierge notices"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#d9bd95]" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="preferred-focus rounded-full p-1.5 text-[#f6f1e8]/60 hover:bg-[#c8a87c]/10 hover:text-[#f6f1e8]"
              aria-label="Minimize concierge"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { stopVideo(); setOpen(false); }}
              className="preferred-focus rounded-full p-1.5 text-[#f6f1e8]/60 hover:bg-[#c8a87c]/10 hover:text-[#f6f1e8]"
              aria-label="Close concierge"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {videoUrl ? (
          <ConciergeVideoPanel
            url={videoUrl}
            busy={videoBusy}
            onEnd={stopVideo}
            displayName={customer?.first_name || String(customer?.full_name || "").split(" ")[0] || ""}
          />
        ) : null}

        {showNotices ? (
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#c8a87c]">For you</p>
              {noticesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c8a87c]" />}
            </div>
            {!notices.length && !noticesLoading && (
              <p className="rounded-xl border border-[#c8a87c]/15 bg-black/25 px-3 py-3 text-[12px] text-[#f6f1e8]/55">
                Nothing needs your attention right now.
              </p>
            )}
            <ul className="space-y-2">
              {notices.map((notice) => (
                <li key={notice.notice_id}>
                  <button
                    type="button"
                    onClick={() => openNotice(notice)}
                    className="preferred-focus w-full rounded-xl border border-[#c8a87c]/18 bg-black/25 px-3 py-2.5 text-left hover:border-[#c8a87c]/40"
                  >
                    <p className="flex items-center gap-2 text-[13px] text-[#f6f1e8]">
                      {!notice.read && <span className="h-1.5 w-1.5 rounded-full bg-[#d9bd95]" />}
                      {notice.title}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#f6f1e8]/55">{notice.body}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((message, index) => {
              if (message.role === "customer") {
                return (
                  <div key={index} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#c8a87c]/18 px-3 py-2 text-[13px] text-[#f6f1e8]">
                      {message.text}
                    </p>
                  </div>
                );
              }
              if (message.role === "system") {
                return (
                  <p key={index} className="rounded-xl border border-[#c8a87c]/20 bg-black/30 px-3 py-2 text-[12px] text-[#f6f1e8]/60">
                    {message.text}
                  </p>
                );
              }
              return (
                <div key={index} className="space-y-2">
                  <p className="max-w-[92%] rounded-2xl rounded-bl-sm border border-[#c8a87c]/15 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-[#f6f1e8]/90">
                    {message.text}
                  </p>
                  {(message.actions || [])
                    .filter((action) => action.ok && action.data)
                    .slice(0, 2)
                    .map((action, actionIndex) => (
                      <ConciergeResultCard key={`${index}-${actionIndex}`} data={action.data} />
                    ))}
                </div>
              );
            })}

            {videoIssue && (
              <div className="rounded-xl border border-[#c8a87c]/25 bg-black/35 px-3 py-2.5">
                <p className="text-[12px] text-[#f6f1e8]/75">{videoIssue}</p>
                {videoChecklist.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {videoChecklist.map((step) => (
                      <li key={step} className="flex gap-1.5 text-[11px] leading-relaxed text-[#f6f1e8]/50">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#c8a87c]" />
                        {step}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {pending && (
              <div className="rounded-2xl border border-[#c8a87c]/40 bg-[#c8a87c]/8 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#c8a87c]">Please confirm</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#f6f1e8]/85">{pending.summary}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide("confirm")}
                    disabled={busy}
                    className="preferred-focus flex-1 rounded-full bg-[#d3b389] px-3 py-1.5 text-[12px] font-medium text-[#14181a] disabled:opacity-60"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => decide("decline")}
                    disabled={busy}
                    className="preferred-focus flex-1 rounded-full border border-[#c8a87c]/40 px-3 py-1.5 text-[12px] text-[#f6f1e8]/80 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <p className="flex items-center gap-2 text-[11px] text-[#f6f1e8]/45">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c8a87c]" />
                Working on it…
              </p>
            )}
          </div>
        )}

        <div className="border-t border-[#c8a87c]/20 px-3 py-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            {!videoUrl && (
              <button
                type="button"
                onClick={startVideo}
                disabled={videoBusy}
                className="preferred-focus flex items-center gap-1.5 rounded-full border border-[#c8a87c]/30 px-2.5 py-1 text-[11px] text-[#f6f1e8]/80 hover:bg-[#c8a87c]/10 disabled:opacity-60"
              >
                {videoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                {videoBusy ? "Connecting" : "Talk to concierge"}
              </button>
            )}
            <button
              type="button"
              onClick={() => send("I would like a human specialist to contact me.")}
              disabled={busy}
              className="preferred-focus flex items-center gap-1.5 rounded-full border border-[#c8a87c]/30 px-2.5 py-1 text-[11px] text-[#f6f1e8]/80 hover:bg-[#c8a87c]/10 disabled:opacity-60"
            >
              <UserRound className="h-3.5 w-3.5" />
              Human help
            </button>
            <button
              type="button"
              onClick={clearConversation}
              className="preferred-focus ml-auto rounded-full px-2 py-1 text-[10px] uppercase tracking-wide text-[#f6f1e8]/40 hover:text-[#f6f1e8]/70"
            >
              Clear
            </button>
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); send(draft); }}
            className="flex items-end gap-2"
          >
            <label className="sr-only" htmlFor="concierge-input">Ask the concierge</label>
            <textarea
              id="concierge-input"
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(draft);
                }
              }}
              placeholder={firstName ? `What do you need, ${firstName}?` : "What do you need?"}
              className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-[#c8a87c]/25 bg-black/40 px-3 py-2 text-[13px] text-[#f6f1e8] placeholder:text-[#f6f1e8]/35 focus:border-[#c8a87c]/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="preferred-focus flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-[#d3b389] text-[#14181a] disabled:opacity-45"
              aria-label="Send instruction"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="mt-2 flex items-center gap-1 text-[10px] leading-relaxed text-[#f6f1e8]/35">
            <Sparkles className="h-3 w-3" />
            AI-powered representative. Payments, bookings and publishing are confirmed by you.
          </p>
        </div>
      </div>
    </div>
  );
}