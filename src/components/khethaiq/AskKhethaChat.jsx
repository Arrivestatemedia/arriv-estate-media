import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, MessageSquarePlus, LoaderCircle, User, Bot, ArrowLeft, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Estate Media color palette (replaces central app's green)
const DARK = "#1A1A1A";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const CREAM = "#FFFBF5";
const WHITE = "#FFFFFF";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function AskKhethaChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [input, setInput] = useState("");
  const [loadingConv, setLoadingConv] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const loadConversations = async () => {
    setLoadingConv(true);
    try {
      const res = await base44.functions.invoke("manageAskKhetha", { action: "list", data: {} });
      const data = res?.data ?? res;
      const convs = data?.conversations || [];
      setConversations(convs);
      if (convs.length && !activeConv) setActiveConv(convs[0]);
    } catch (e) {
      setError(e?.message || "Failed to load conversations");
    } finally {
      setLoadingConv(false);
    }
  };

  useEffect(() => { loadConversations(); }, []);
  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
  }, [activeConv, sending]);

  const selectConv = (conv) => { setActiveConv(conv); setError(null); };
  const newConversation = () => { setActiveConv(null); setInput(""); setError(null); };

  const sendMessage = async (msgText) => {
    const text = (msgText || input).trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const convId = activeConv?.conversation_id || "";
    try {
      const res = await base44.functions.invoke("manageAskKhetha", {
        action: "send",
        data: { request: text, conversation_id: convId },
      });
      const data = res?.data ?? res;
      if (data?.conversation) {
        setActiveConv(data.conversation);
        await loadConversations();
      }
      setInput("");
    } catch (e) {
      setError(e?.message || "Failed to get a response");
    } finally {
      setSending(false);
    }
  };

  const deleteConv = async (convId, e) => {
    e.stopPropagation();
    try {
      await base44.functions.invoke("manageAskKhetha", { action: "delete", data: { conversation_id: convId } });
      if (activeConv?.conversation_id === convId) setActiveConv(null);
      await loadConversations();
    } catch (e2) {}
  };

  const messages = activeConv?.messages || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ ...SERIF, color: DARK }}>
          <Sparkles className="w-6 h-6" style={{ color: GOLD }} /> Ask Khetha
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(26,26,26,0.6)" }}>
          Your AI recruiting assistant. Conversations are saved and shared with Arriv One.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-16rem)] min-h-[420px]">
        {/* Left sidebar - conversation list */}
        <div className="bg-white border rounded-xl p-3 flex flex-col overflow-hidden" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          <Button
            onClick={newConversation}
            variant="outline"
            size="sm"
            className="w-full mb-3 gap-1.5"
            style={{ borderColor: "rgba(184,149,106,0.3)", color: DARK }}
          >
            <MessageSquarePlus className="w-4 h-4" /> New Conversation
          </Button>
          <div className="flex-1 overflow-y-auto space-y-1">
            {loadingConv ? (
              <div className="flex justify-center py-6">
                <LoaderCircle className="w-5 h-5 animate-spin" style={{ color: "rgba(26,26,26,0.4)" }} />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "rgba(26,26,26,0.5)" }}>
                No conversations yet. Ask your first question.
              </p>
            ) : (
              conversations.map((conv) => {
                const isActive = activeConv?.conversation_id === conv.conversation_id;
                return (
                  <div key={conv.conversation_id} className="relative group">
                    <button
                      onClick={() => selectConv(conv)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        backgroundColor: isActive ? GOLD : "transparent",
                        color: isActive ? WHITE : "rgba(26,26,26,0.8)",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.1)"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <div className="font-medium truncate" style={{ ...SERIF }}>{conv.title || "New conversation"}</div>
                      <div className="text-xs truncate" style={{ color: isActive ? "rgba(255,255,255,0.7)" : "rgba(26,26,26,0.4)" }}>
                        {conv.created_from === "arriv_one" ? "Arriv One" : "Standalone"}
                        {conv.last_message_at ? ` · ${new Date(conv.last_message_at).toLocaleDateString()}` : ""}
                      </div>
                    </button>
                    <button
                      onClick={(e) => deleteConv(conv.conversation_id, e)}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                      style={{ color: isActive ? WHITE : "rgba(26,26,26,0.4)" }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right - chat area */}
        <div className="bg-white border rounded-xl flex flex-col overflow-hidden" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
          {activeConv ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(184,149,106,0.1)" }}>
                <button onClick={newConversation} className="md:hidden p-1" style={{ color: "rgba(26,26,26,0.6)" }}>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="font-semibold truncate" style={{ ...SERIF, color: DARK }}>
                  {activeConv.title || "Conversation"}
                </h3>
              </div>

              {/* Messages */}
              <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: msg.role === "user" ? DARK : GOLD, color: WHITE }}
                    >
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : ""} flex flex-col`}>
                      <div
                        className="rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                        style={
                          msg.role === "user"
                            ? { backgroundColor: DARK, color: WHITE, borderRadius: "1rem 0.25rem 1rem 1rem" }
                            : { backgroundColor: CREAM, color: DARK, borderRadius: "0.25rem 1rem 1rem 1rem" }
                        }
                      >
                        {msg.content}
                      </div>
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.actions.map((action, j) => (
                            <div
                              key={j}
                              className="text-xs rounded-lg px-2.5 py-1.5"
                              style={{ color: "rgba(26,26,26,0.7)", backgroundColor: "rgba(184,149,106,0.1)" }}
                            >
                              <span className="font-medium uppercase" style={{ color: GOLD }}>{action.type}</span>
                              {" · "}
                              {action.description}
                            </div>
                          ))}
                        </div>
                      )}
                      <span className="text-[10px] mt-1 px-1" style={{ color: "rgba(26,26,26,0.4)" }}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: GOLD, color: WHITE }}>
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: CREAM, borderRadius: "0.25rem 1rem 1rem 1rem" }}>
                      <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: GOLD }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-3 border-t" style={{ borderColor: "rgba(184,149,106,0.1)" }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Ask about candidates, jobs, recruiting strategy..."
                    className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                    style={{ borderColor: "rgba(184,149,106,0.2)" }}
                    onFocus={e => e.target.style.borderColor = GOLD}
                    onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
                    disabled={sending}
                  />
                  <Button
                    onClick={() => sendMessage()}
                    disabled={sending || !input.trim()}
                    size="sm"
                    className="px-3"
                    style={{ backgroundColor: GOLD, color: WHITE }}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                {error && <p className="text-xs mt-2" style={{ color: "#dc2626" }}>{error}</p>}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(184,149,106,0.1)" }}>
                <Sparkles className="w-7 h-7" style={{ color: GOLD }} />
              </div>
              <h3 className="text-lg font-semibold mb-1" style={{ ...SERIF, color: DARK }}>Ask Khetha</h3>
              <p className="text-sm mb-4 max-w-sm" style={{ color: "rgba(26,26,26,0.6)" }}>
                Your AI recruiting assistant. Ask about candidates, job postings, interview best practices, or recruiting strategy.
              </p>
              <div className="flex gap-2 w-full max-w-md">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Ask your first question..."
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                  style={{ borderColor: "rgba(184,149,106,0.2)" }}
                  onFocus={e => e.target.style.borderColor = GOLD}
                  onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.2)"}
                  disabled={sending}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={sending || !input.trim()}
                  size="sm"
                  className="px-3"
                  style={{ backgroundColor: GOLD, color: WHITE }}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {error && <p className="text-xs mt-2" style={{ color: "#dc2626" }}>{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}