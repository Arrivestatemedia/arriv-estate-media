import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Send, Plus, Trash2, Loader2, MessageSquare, Edit3, Paperclip, X, Image } from "lucide-react";
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
  const [attachedImages, setAttachedImages] = useState([]); // [{url, name}]
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages?.length, loading]);

  const createSession = () => {
    const newSession = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [],
      createdAt: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveSessions(updated);
    setActiveSessionId(newSession.id);
    setInput("");
    setTimeout(() => textareaRef.current?.focus(), 100);
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
      updateSession({ ...updatedSession, messages: [...updatedMessages, aiMsg] });
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

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const result = await base44.integrations.Core.UploadFile({ file });
        return { url: result.file_url, name: file.name };
      }));
      setAttachedImages(prev => [...prev, ...uploaded]);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = (idx) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex rounded-xl overflow-hidden border" style={{ height: '700px', borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#fff' }}>

      {/* ── LEFT SIDEBAR (ChatGPT-style) ── */}
      <div className="flex flex-col" style={{ width: '260px', minWidth: '260px', backgroundColor: '#f9f9f9', flexShrink: 0, borderRight: '1px solid #e5e5e5' }}>
        
        {/* New Chat button */}
        <div className="p-3 border-b" style={{ borderColor: '#e5e5e5' }}>
          <button
            onClick={createSession}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition"
            style={{ color: '#1a1a1a', backgroundColor: '#efefef' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0e0e0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#efefef'}
          >
            <Edit3 className="w-4 h-4" />
            New chat
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 && (
            <p className="text-xs text-center mt-6 px-4" style={{ color: 'rgba(0,0,0,0.35)' }}>
              No chats yet — start one!
            </p>
          )}
          {sessions.length > 0 && (
            <div className="px-2">
              <p className="text-xs px-2 mb-1 font-medium" style={{ color: 'rgba(0,0,0,0.35)' }}>Recent</p>
              {sessions.map(s => (
                <div
                  key={s.id}
                  className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition mb-0.5"
                  style={{
                    backgroundColor: s.id === activeSessionId ? '#e8e8e8' : 'transparent',
                  }}
                  onClick={() => setActiveSessionId(s.id)}
                  onMouseEnter={e => { if (s.id !== activeSessionId) e.currentTarget.style.backgroundColor = '#efefef'; }}
                  onMouseLeave={e => { if (s.id !== activeSessionId) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(0,0,0,0.35)' }} />
                  <span className="flex-1 text-sm truncate" style={{ color: s.id === activeSessionId ? '#1a1a1a' : 'rgba(0,0,0,0.7)' }}>
                    {s.title || "Chat"}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition hover:text-red-500"
                    style={{ color: 'rgba(0,0,0,0.35)' }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t" style={{ borderColor: '#e5e5e5' }}>
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#B8956A' }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs truncate" style={{ color: 'rgba(0,0,0,0.45)' }}>AI Sales Assistant</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT CHAT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: '#ffffff' }}>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {!activeSession || activeSession.messages.length === 0 ? (
            /* Welcome / empty state */
            <div className="flex flex-col items-center justify-center h-full px-6 gap-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#B8956A' }}>
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-semibold mb-2" style={{ color: '#1a1a1a' }}>How can I help you today?</h2>
                <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>Your AI sales assistant for Arriv — emails, scripts, objections & more.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {STARTER_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(p)}
                    className="text-left text-sm px-4 py-3 rounded-xl border transition"
                    style={{ borderColor: '#e5e5e5', backgroundColor: '#f9f9f9', color: '#1a1a1a' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#efefef'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-6">
              {activeSession.messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#B8956A' }}>
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className="text-sm leading-relaxed"
                    style={{
                      maxWidth: msg.role === "user" ? '70%' : '85%',
                      backgroundColor: msg.role === "user" ? '#1a1a1a' : 'transparent',
                      color: msg.role === "user" ? '#fff' : '#1a1a1a',
                      borderRadius: msg.role === "user" ? '18px' : '0',
                      padding: msg.role === "user" ? '10px 16px' : '0',
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                        components={{
                          p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
                          ul: ({ children }) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          h1: ({ children }) => <h1 className="text-lg font-semibold mt-3 mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                          code: ({ inline, children }) => inline
                            ? <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'rgba(0,0,0,0.07)' }}>{children}</code>
                            : <pre className="p-3 rounded-lg text-xs overflow-x-auto my-2" style={{ backgroundColor: '#f4f4f4' }}><code>{children}</code></pre>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#B8956A' }}>
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1 pt-2">
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'rgba(0,0,0,0.3)', animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'rgba(0,0,0,0.3)', animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'rgba(0,0,0,0.3)', animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-5 pt-2" style={{ backgroundColor: '#ffffff' }}>
          <div className="max-w-3xl mx-auto">
            <div
              className="flex items-end gap-2 rounded-2xl px-4 py-3"
              style={{ backgroundColor: '#f4f4f4', border: '1px solid #e5e5e5' }}
            >
              <Textarea
                ref={textareaRef}
                placeholder="Message AI Assistant..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                className="flex-1 resize-none text-sm border-0 bg-transparent p-0 focus-visible:ring-0 shadow-none"
                style={{ color: '#1a1a1a', minHeight: '24px', maxHeight: '160px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition disabled:opacity-30"
                style={{ backgroundColor: input.trim() && !loading ? '#B8956A' : '#d0d0d0' }}
              >
                {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
            <p className="text-center text-xs mt-2" style={{ color: 'rgba(0,0,0,0.25)' }}>
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}