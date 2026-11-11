import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Mic, Send } from "lucide-react";
import { askConcierge, confirmConciergeAction } from "@/lib/conciergeClient";
import { applyConciergeUi } from "@/lib/conciergeUi";
import ConciergeResultCard from "@/components/preferred/ConciergeResultCard";

const SESSION_KEY = "arriv_concierge_session_id";
const CONVO_KEY = "arriv_concierge_conversation_id";

function timeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "this morning";
  if (hour < 18) return "this afternoon";
  return "this evening";
}

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

/**
 * The concierge conversation under the video stage: same session, same history and same
 * server-side action engine as the floating dock, so switching channels keeps context.
 */
const PreferredConciergeChat = forwardRef(function PreferredConciergeChat({ firstName }, ref) {
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [sessionId, setSessionId] = useState(() => read(SESSION_KEY));
  const [conversationId, setConversationId] = useState(() => read(CONVO_KEY));
  const [listening, setListening] = useState(false);

  useEffect(() => {
    setMessages((current) => (current.length ? current : [{
      role: "concierge",
      text: `Hi ${firstName || "there"}, how are you ${timeOfDay()}? How can I help you?`,
    }]));
  }, [firstName]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, pending, busy]);

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || listening) return;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) setDraft((current) => (current ? `${current} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening]);

  useImperativeHandle(ref, () => ({ startListening, focus: () => inputRef.current?.focus() }), [startListening]);

  const send = useCallback(async (text) => {
    const utterance = String(text || "").trim();
    if (!utterance || busy) return;
    setDraft("");
    setMessages((current) => [...current, { role: "customer", text: utterance }]);
    setBusy(true);
    setPending(null);
    try {
      const result = await askConcierge({
        utterance,
        sessionId,
        conversationId,
        channel: "text",
        context: {
          page: location.pathname,
          listing_id: new URLSearchParams(location.search).get("jobId") || "",
        },
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
      if (result?.ui) applyConciergeUi(result.ui, navigate);
    } catch (error) {
      const status = Number(error?.status || error?.response?.status);
      setMessages((current) => [...current, {
        role: "system",
        text: status === 403
          ? "The concierge is part of your Preferred membership."
          : "I couldn't reach Arriv just now. Nothing was changed on your account — please try again.",
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, location.pathname, location.search, navigate, sessionId]);

  const decide = useCallback(async (decision) => {
    if (!pending?.action_record_id) return;
    const current = pending;
    setPending(null);
    setBusy(true);
    try {
      const result = await confirmConciergeAction({ actionRecordId: current.action_record_id, decision });
      setMessages((list) => [...list, {
        role: "concierge",
        text: result?.reply || (decision === "decline" ? "No changes were made." : "Done."),
      }]);
      if (result?.ok && result?.ui) applyConciergeUi(result.ui, navigate);
    } catch {
      setMessages((list) => [...list, {
        role: "system",
        text: "That request could not be completed. Nothing was changed on your account.",
      }]);
    } finally {
      setBusy(false);
    }
  }, [navigate, pending]);

  const thread = messages.slice(-6);

  return (
    <div className="mt-3">
      <div ref={scrollRef} className="preferred-scroll max-h-[150px] space-y-2 overflow-y-auto px-1">
        {thread.map((message, index) => {
          if (message.role === "customer") {
            return (
              <div key={index} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#c8a87c]/18 px-3 py-1.5 text-[12.5px] text-[#f6f1e8]">
                  {message.text}
                </p>
              </div>
            );
          }
          if (message.role === "system") {
            return (
              <p key={index} className="rounded-xl border border-[#c8a87c]/20 bg-black/25 px-3 py-1.5 text-[11.5px] text-[#f6f1e8]/55">
                {message.text}
              </p>
            );
          }
          return (
            <div key={index} className="space-y-1.5">
              <p className="max-w-[88%] rounded-2xl rounded-bl-sm border border-[#c8a87c]/15 bg-black/30 px-3 py-1.5 text-[12.5px] leading-relaxed text-[#f6f1e8]/90">
                {message.text}
              </p>
              {(message.actions || []).filter((action) => action.ok && action.data).slice(0, 1).map((action, i) => (
                <ConciergeResultCard key={`${index}-${i}`} data={action.data} />
              ))}
            </div>
          );
        })}

        {pending && (
          <div className="rounded-xl border border-[#c8a87c]/40 bg-[#c8a87c]/8 px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#c8a87c]">Please confirm</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#f6f1e8]/85">{pending.summary}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => decide("confirm")}
                disabled={busy}
                className="preferred-focus flex-1 rounded-full bg-[#d3b389] px-3 py-1.5 text-[11.5px] font-medium text-[#14181a] disabled:opacity-60"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => decide("decline")}
                disabled={busy}
                className="preferred-focus flex-1 rounded-full border border-[#c8a87c]/40 px-3 py-1.5 text-[11.5px] text-[#f6f1e8]/80 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-[11px] text-[#f6f1e8]/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#c8a87c]" /> Working on it…
          </p>
        )}
      </div>

      <form
        onSubmit={(event) => { event.preventDefault(); send(draft); }}
        className="mt-2 flex items-center gap-2 rounded-2xl border border-[#c8a87c]/25 bg-black/40 px-2 py-1.5"
      >
        <button
          type="button"
          onClick={startListening}
          aria-label="Speak to the concierge"
          className={`preferred-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            listening ? "bg-[#c8a87c]/25 text-[#f0dcb9]" : "text-[#f6f1e8]/55 hover:bg-[#c8a87c]/12 hover:text-[#f6f1e8]"
          }`}
        >
          <Mic className="h-4 w-4" />
        </button>
        <label className="sr-only" htmlFor="workspace-concierge-input">Ask the concierge</label>
        <input
          id="workspace-concierge-input"
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Tell me what you need, and I'll handle it."
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-[#f6f1e8] placeholder:text-[#f6f1e8]/35 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send instruction"
          className="preferred-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d3b389] text-[#14181a] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </form>
      <p className="mt-1.5 flex items-center gap-1 px-1 text-[10px] text-[#f6f1e8]/30">
        <Send className="h-2.5 w-2.5" /> Payments, bookings and publishing are always confirmed by you.
      </p>
    </div>
  );
});

export default PreferredConciergeChat;