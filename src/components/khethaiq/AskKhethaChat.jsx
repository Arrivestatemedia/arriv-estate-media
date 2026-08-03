import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Loader2, User, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const SUGGESTED_PROMPTS = [
  { icon: "📊", text: "Give me an overview of our hiring pipeline" },
  { icon: "🎯", text: "What are the key requirements for the Media Specialist role?" },
  { icon: "👤", text: "Who are our top candidates right now?" },
  { icon: "💡", text: "What interview questions should I ask to assess fit?" },
  { icon: "📈", text: "How can I improve our time-to-hire?" },
  { icon: "🔍", text: "What skills should I look for in a Sales Growth Advisor?" },
];

export default function AskKhethaChat({ candidate, job }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // If a candidate/job is passed in, seed an initial context message
  useEffect(() => {
    if (candidate?.name) {
      setMessages([{
        role: "system",
        content: `Context loaded: **${candidate.name}** (Status: ${candidate.status || "applied"}). Ask any question about this candidate.`,
      }]);
    } else if (job?.title) {
      setMessages([{
        role: "system",
        content: `Context loaded: **${job.title}** job opening. Ask any question about this role.`,
      }]);
    }
  }, [candidate, job]);

  const handleSend = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;

    const userMsg = { role: "user", content: query };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await base44.functions.invoke("manageHireHandoff", {
        action: "ask_khetha",
        question: query,
        candidateId: candidate?.id,
        jobId: job?.id,
      });
      const answer = res?.data?.answer || res?.answer || "I couldn't process that question.";
      setMessages(prev => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I encountered an error processing your question. Please try again.",
      }]);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setMessages(candidate?.name || job?.title ? messages.slice(0, 1) : []);
    setInput("");
    inputRef.current?.focus();
  };

  const showSuggestions = messages.filter(m => m.role !== "system").length === 0;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 8rem)", minHeight: "500px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
            <Sparkles className="w-5 h-5" style={{ color: GOLD }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Ask Khetha</h1>
            <p className="text-sm" style={{ color: MUTED_DARK }}>AI recruiting assistant with full Estate Media context</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK, backgroundColor: "#FFFFFF" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Chat
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col" style={card}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, i) => {
            if (msg.role === "system") {
              return (
                <div key={i} className="flex justify-center">
                  <div className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "rgba(184,149,106,0.1)", color: GOLD }}>
                    {msg.content}
                  </div>
                </div>
              );
            }
            const isUser = msg.role === "user";
            return (
              <div key={i} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: isUser ? GOLD : "rgba(184,149,106,0.15)" }}>
                  {isUser ? <User className="w-4 h-4" style={{ color: "#1A1A1A" }} /> : <Sparkles className="w-4 h-4" style={{ color: GOLD }} />}
                </div>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                  style={{
                    backgroundColor: isUser ? GOLD : "#2A2A2A",
                    border: isUser ? "none" : "1px solid rgba(184,149,106,0.15)",
                  }}>
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "#1A1A1A", fontWeight: 500 }}>{msg.content}</p>
                  ) : (
                    <div className="text-sm prose-sm" style={{ color: CREAM }}>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
                <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.15)" }}>
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: GOLD, animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: GOLD, animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: GOLD, animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {/* Suggested prompts (only when empty) */}
          {showSuggestions && !loading && (
            <div className="pt-2">
              <p className="text-sm font-medium mb-3" style={{ color: MUTED_LIGHT }}>Try asking:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(p.text)}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-left text-sm transition-all hover:translate-y-[-1px]"
                    style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.15)", color: CREAM }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,149,106,0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,149,106,0.15)"; }}
                  >
                    <span className="text-base">{p.icon}</span>
                    {p.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4" style={{ borderTop: "1px solid rgba(184,149,106,0.15)" }}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask about candidates, roles, interview strategy, or anything recruiting..."
              className="flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{ backgroundColor: "#2A2A2A", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-opacity"
              style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600, opacity: (loading || !input.trim()) ? 0.5 : 1 }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}