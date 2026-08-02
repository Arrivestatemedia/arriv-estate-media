import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Brain, Send, ExternalLink, Loader2 } from "lucide-react";

export default function BenefitsAiAssistant({ salesMemberId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const suggestions = [
    "What benefits am I enrolled in?",
    "How do I add a dependent?",
    "When is open enrollment?",
    "How do I update my beneficiaries?",
  ];

  const ask = async (question) => {
    if (!question.trim() || loading) return;
    const userMsg = { role: "user", text: question };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "ask_ai",
        sales_member_id: salesMemberId,
        question,
      });
      const data = res.data || res;
      const aiMsg = {
        role: "assistant",
        text: data.response?.answer || "I'm sorry, I couldn't process that question.",
        action_label: data.response?.action_label || "",
        action_url: data.response?.action_url || "",
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong. Please try again or contact HR." }]);
    }
    setLoading(false);
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-5 h-5 text-[#B8956A]" />
        <h2 className="text-lg font-semibold text-slate-900">Benefits Assistant</h2>
      </div>

      <div ref={scrollRef} className="space-y-3 max-h-80 overflow-y-auto mb-3 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-slate-500 mb-3">Ask me anything about your benefits.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
              msg.role === "user"
                ? "bg-[#B8956A] text-white"
                : "bg-slate-100 text-slate-800"
            }`}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.action_url && msg.action_label && (
                <a
                  href={msg.action_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs underline"
                >
                  <ExternalLink className="w-3 h-3" /> {msg.action_label}
                </a>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 px-3 py-2 rounded-lg">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Ask about your benefits..."
          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
        />
        <Button size="sm" onClick={() => ask(input)} disabled={loading || !input.trim()}>
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}