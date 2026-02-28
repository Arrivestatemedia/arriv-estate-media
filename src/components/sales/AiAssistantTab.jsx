import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Send, Plus, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";

const STORAGE_KEY = "ai_assistant_sessions";

const STARTER_PROMPTS = [
  "Write me a cold outreach email for a real estate agent",
  "What are the best objection handling techniques for real estate media sales?",
  "Give me 5 follow-up strategies for prospects who went cold",
  "Write a call script to pitch Arriv's photo + video package",
  "How do I handle a prospect who says they already have a photographer?",
];

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export default function AiAssistantTab({ repName }) {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const s = loadSessions();
    return s.length > 0 ? s[0].id : null;
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages?.length, loading]);

  const createSession = () => {
    const newSession = {
      id: Date.now().toString(),
      title: "New Conversation",
      messages: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setActiveSessionId(newSession.id);
    setInput("");
  };

  const deleteSession = (id) => {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    saveSessions(updated);
    if (activeSessionId === id) {
      setActiveSessionId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const updateSession = (updatedSession) => {
    setSessions(prev => {
      const updated = prev.map(s => s.id === updatedSession.id ? updatedSession : s);
      saveSessions(updated);
      return updated;
    });
  };

  const sendMessage = async (messageText) => {
    const text = (messageText || input).trim();
    if (!text || loading) return;

    let session = activeSession;
    if (!session) {
      session = {
        id: Date.now().toString(),
        title: text.slice(0, 40),
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setSessions(prev => {
        const updated = [session, ...prev];
        saveSessions(updated);
        return updated;
      });
      setActiveSessionId(session.id);
    }

    const userMsg = { role: "user", content: text, id: Date.now() };
    const updatedMessages = [...(session.messages || []), userMsg];
    const updatedSession = {
      ...session,
      messages: updatedMessages,
      title: session.messages.length === 0 ? text.slice(0, 45) : session.title,
    };
    updateSession(updatedSession);
    setInput("");
    setLoading(true);

    try {
      // Build conversation history for context
      const historyText = updatedMessages
        .slice(-10)
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const prompt = `You are an AI sales assistant for Arriv, a real estate media company offering professional photography, videography, MLS walkthroughs, and cinematic video packages to real estate agents.

You help sales reps with: email drafting, call scripts, objection handling, follow-up strategies, pricing questions, negotiation tips, and general sales advice.

Sales rep name: ${repName || "the rep"}

Conversation so far:
${historyText}

Please respond helpfully and concisely. Use markdown formatting where appropriate (bullet points, bold text, etc.).`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      const aiText = typeof res === "string" ? res : res?.text || String(res);

      const aiMsg = { role: "assistant", content: aiText, id: Date.now() + 1 };
      const finalSession = {
        ...updatedSession,
        messages: [...updatedMessages, aiMsg],
      };
      updateSession(finalSession);
    } catch (e) {
      const errMsg = { role: "assistant", content: "Sorry, something went wrong. Please try again.", id: Date.now() + 1 };
      updateSession({ ...updatedSession, messages: [...updatedMessages, errMsg] });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-[680px] rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: '#fff' }}>
      {/* Sidebar */}
      <div
        className="flex flex-col border-r transition-all"
        style={{
          width: sidebarOpen ? '220px' : '48px',
          minWidth: sidebarOpen ? '220px' : '48px',
          borderColor: 'rgba(184,149,106,0.2)',
          backgroundColor: '#FFFBF5',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          {sidebarOpen && (
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#B8956A' }}>Sessions</span>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1 rounded hover:bg-black/5 transition"
            title={sidebarOpen ? "Collapse" : "Expand"}
          >
            {sidebarOpen ? <ChevronDown className="w-4 h-4 rotate-90" style={{ color: '#B8956A' }} /> : <ChevronRight className="w-4 h-4" style={{ color: '#B8956A' }} />}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <button
              onClick={createSession}
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b transition hover:bg-black/5"
              style={{ color: '#B8956A', borderColor: 'rgba(184,149,106,0.15)' }}
            >
              <Plus className="w-4 h-4 flex-shrink-0" />
              New Chat
            </button>
            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 && (
                <p className="text-xs text-center mt-4 px-3" style={{ color: 'rgba(26,26,26,0.4)' }}>No sessions yet</p>
              )}
              {sessions.map(s => (
                <div
                  key={s.id}
                  className="group flex items-center gap-1 px-3 py-2.5 cursor-pointer border-b transition"
                  style={{
                    borderColor: 'rgba(184,149,106,0.1)',
                    backgroundColor: s.id === activeSessionId ? 'rgba(184,149,106,0.12)' : 'transparent',
                  }}
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <span className="flex-1 text-xs truncate" style={{ color: s.id === activeSessionId ? '#B8956A' : '#1A1A1A' }}>
                    {s.title || "Conversation"}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition"
                    style={{ color: 'rgba(26,26,26,0.4)' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <Sparkles className="w-5 h-5" style={{ color: '#B8956A' }} />
          <span className="font-semibold text-sm" style={{ color: '#1A1A1A' }}>AI Sales Assistant</span>
          <span className="text-xs ml-auto" style={{ color: 'rgba(26,26,26,0.4)' }}>
            {activeSession ? `${activeSession.messages.length} messages` : "Start a new conversation"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 pb-4">
              <div className="text-center">
                <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: '#B8956A' }} />
                <h3 className="font-semibold text-lg" style={{ color: '#1A1A1A' }}>How can I help you today?</h3>
                <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>Ask me anything about sales, emails, scripts, or objections.</p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                {STARTER_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p)}
                    className="text-left text-xs px-4 py-2.5 rounded-xl border transition hover:opacity-80"
                    style={{ borderColor: 'rgba(184,149,106,0.3)', backgroundColor: 'rgba(184,149,106,0.06)', color: '#1A1A1A' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeSession.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1"
                      style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                      <Sparkles className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "text-white" : ""}`}
                    style={{
                      backgroundColor: msg.role === "user" ? '#1A1A1A' : 'rgba(184,149,106,0.1)',
                      color: msg.role === "user" ? '#fff' : '#1A1A1A',
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                        components={{
                          p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
                          ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
                          li: ({ children }) => <li className="my-0.5">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          h3: ({ children }) => <h3 className="font-semibold mt-2 mb-1">{children}</h3>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0"
                    style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#B8956A' }} />
                  </div>
                  <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(184,149,106,0.1)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#B8956A' }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
          <div className="flex gap-2 items-end">
            <Textarea
              placeholder="Ask anything... (Shift+Enter for new line, Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="flex-1 resize-none text-sm"
              style={{ borderColor: 'rgba(184,149,106,0.3)' }}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              size="icon"
              style={{ backgroundColor: '#B8956A', color: '#1A1A1A', flexShrink: 0 }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          {activeSession && (
            <button
              onClick={createSession}
              className="text-xs mt-2 flex items-center gap-1 hover:opacity-70 transition"
              style={{ color: 'rgba(26,26,26,0.4)' }}
            >
              <Plus className="w-3 h-3" /> New conversation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}