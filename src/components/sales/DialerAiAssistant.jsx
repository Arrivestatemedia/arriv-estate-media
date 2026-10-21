import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Send, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "there";

/**
 * DialerAiAssistant — mobile only.
 * The AI helper built into the dialer's messaging: it sees the open text thread
 * and can draft the reply the rep sends.
 */
export default function DialerAiAssistant({ repName, conversation, onInsertReply, onClose }) {
  const contactName = conversation?.name || conversation?.phone || "";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: conversation
        ? `Hi ${firstName(repName)} — I'm your Arriv assistant. I can see your thread with ${contactName}. Ask me to draft a reply, or ask me anything about handling them.`
        : `Hi ${firstName(repName)} — I'm your Arriv assistant. Ask me to draft a text, handle an objection, or plan your next call.`,
    }]);
  }, [conversation?.phone, repName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    const thread = (conversation?.messages || [])
      .slice(-8)
      .map((m) => `${m.direction === "outbound" ? "Rep" : contactName}: ${m.body}`)
      .join("\n");

    const prompt = [
      "You are the Arriv AI assistant built into a sales rep's phone dialer. Arriv Estate Media provides real estate photography, video, drone and MLS media only.",
      `Rep: ${repName || "the rep"}.`,
      conversation
        ? `The rep has a text thread open with ${contactName} (${conversation.phone || ""}).\nRecent messages:\n${thread || "(none yet)"}\nWhen the rep asks for a reply, answer with ONLY the text to send: casual, warm, 1-3 sentences, no placeholders, no subject line.`
        : "",
      "Keep answers short and concrete. Never quote prices or discounts — Brad handles pricing.",
      `Conversation so far:\n${next.map((m) => `${m.role === "user" ? "Rep" : "Assistant"}: ${m.content}`).join("\n")}`,
      "Assistant:",
    ].filter(Boolean).join("\n\n");

    try {
      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: typeof res === "string" ? res : res?.text || String(res),
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: "I couldn't reach the assistant just now — try again in a moment.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-white flex flex-col"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b shrink-0" style={{ borderColor: "rgba(184,149,106,0.25)" }}>
        <Sparkles className="w-5 h-5" style={{ color: "#B8956A" }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold" style={{ color: "#1A1A1A" }}>Arriv AI Assistant</p>
          {contactName && <p className="text-xs truncate" style={{ color: "rgba(26,26,26,0.5)" }}>About {contactName}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap"
              style={m.role === "user"
                ? { backgroundColor: "#B8956A", color: "#fff" }
                : { backgroundColor: "#f3f4f6", color: "#1A1A1A" }}
            >
              {m.content}
              {m.role === "assistant" && onInsertReply && i > 0 && (
                <button
                  onClick={() => onInsertReply(m.content)}
                  className="mt-2 block text-xs font-medium underline"
                  style={{ color: "#B8956A" }}
                >
                  Use as reply
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2" style={{ backgroundColor: "#f3f4f6" }}>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#B8956A" }} />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 p-3 border-t shrink-0" style={{ borderColor: "rgba(184,149,106,0.25)" }}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the assistant..."
        />
        <Button onClick={send} disabled={!input.trim() || loading} size="icon" style={{ backgroundColor: "#B8956A" }}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}