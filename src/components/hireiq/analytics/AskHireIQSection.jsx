import React, { useState } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SectionWrapper, CREAM, GOLD, MUTED_LIGHT, card, SERIF } from "./shared";
import { buildAIContext } from "@/lib/analyticsEngine";

const SUGGESTED = [
  "Why are offers being declined?",
  "Why are communication scores dropping?",
  "Which interview questions predict our best hires?",
  "What changed this quarter?",
  "Which sourcing channel produces the best performers?",
  "Where are candidates dropping off in our funnel?",
];

export default function AskHireIQSection({ data }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleAsk = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setQuestion(query);
    try {
      const context = buildAIContext(data);
      const prompt = `You are HireIQ, an AI hiring analytics assistant. Answer the hiring manager's question using ONLY the data provided below. If the data is insufficient to answer, explicitly state that.

${context}

QUESTION: ${query}

Answer concisely with specific numbers from the data. If the data doesn't cover the question, say "I don't have enough data to answer this question yet."`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: null });
      const response = typeof res === "string" ? res : res?.response || res?.data || JSON.stringify(res);
      setAnswer(response);
      setHistory(prev => [{ q: query, a: response }, ...prev].slice(0, 5));
    } catch (err) {
      setAnswer("Sorry, I couldn't process that question. Please try again.");
    }
    setLoading(false);
  };

  return (
    <SectionWrapper title="Ask HireIQ" icon={MessageCircle}>
      <div className="p-5" style={card}>
        <p className="text-sm mb-3" style={{ color: MUTED_LIGHT }}>
          Ask questions about your hiring data. HireIQ answers using ONLY your company's hiring data — if there isn't enough data, it will tell you.
        </p>
        <div className="flex gap-2 mb-3">
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAsk()}
            placeholder="Ask a question about your hiring data..."
            className="flex-1 px-4 py-2.5 rounded-lg text-sm"
            style={{ backgroundColor: "#2A2A2A", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }} />
          <button onClick={() => handleAsk()} disabled={loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
            style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600 }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTED.map((s, i) => (
            <button key={i} onClick={() => handleAsk(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ backgroundColor: "rgba(184,149,106,0.08)", color: GOLD, border: "1px solid rgba(184,149,106,0.15)" }}>
              {s}
            </button>
          ))}
        </div>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
            <span className="ml-2 text-sm" style={{ color: MUTED_LIGHT }}>Analyzing your hiring data...</span>
          </div>
        )}
        {!loading && answer && (
          <div className="p-4 rounded-lg" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.15)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>HireIQ</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: CREAM }}>{answer}</p>
          </div>
        )}
        {history.length > 1 && !loading && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold" style={{ color: MUTED_LIGHT }}>Recent Questions</p>
            {history.slice(1).map((h, i) => (
              <button key={i} onClick={() => { setAnswer(h.a); setQuestion(h.q); }}
                className="block w-full text-left text-xs px-3 py-2 rounded transition-colors hover:bg-white/5"
                style={{ color: MUTED_LIGHT }}>
                {h.q}
              </button>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}