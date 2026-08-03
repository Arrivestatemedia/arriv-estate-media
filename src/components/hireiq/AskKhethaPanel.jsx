import React, { useState } from "react";
import { MessageCircle, Send, Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const innerBg = "#2A2A2A";

const SUGGESTED = [
  "What are the key requirements for this role?",
  "How does this candidate's experience match the job?",
  "What concerns should I explore in the interview?",
  "What questions should I ask to assess fit?",
  "Does this candidate have the equipment and capabilities for a Media Specialist role?",
  "What is this candidate's strongest qualification?",
];

export default function AskKhethaPanel({ candidate, job }) {
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
      const res = await base44.functions.invoke("manageHireHandoff", {
        action: "ask_khetha",
        question: query,
        candidateId: candidate?.id,
        jobId: job?.id,
      });
      const response = res?.data?.answer || res?.answer || "I couldn't process that question.";
      setAnswer(response);
      setHistory(prev => [{ q: query, a: response }, ...prev].slice(0, 5));
    } catch (err) {
      setAnswer("Sorry, I couldn't process that question. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="p-5" style={card}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
          <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
        </div>
        <div>
          <h3 className="font-bold text-sm" style={{ ...SERIF, color: CREAM }}>Ask Khetha</h3>
          <p className="text-xs" style={{ color: MUTED_LIGHT }}>AI recruiting assistant with Estate Media context</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAsk()}
          placeholder="Ask about this candidate, the role, or recruiting strategy..."
          className="flex-1 px-4 py-2.5 rounded-lg text-sm"
          style={{ backgroundColor: innerBg, color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }} />
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
          <span className="ml-2 text-sm" style={{ color: MUTED_LIGHT }}>Khetha IQ is analyzing...</span>
        </div>
      )}

      {!loading && answer && (
        <div className="p-4 rounded-lg" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.15)" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>Khetha IQ</p>
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
  );
}