import React, { useState, useEffect, useRef } from "react";
import { Sparkles, X, LoaderCircle, Send, Users } from "lucide-react";
import { naturalLanguageSearch } from "@/lib/recruitingApi";
import { base44 } from "@/api/base44Client";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const CREAM = "#FFFBF5";
const MUTED = "rgba(26,26,26,0.6)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const RESEARCH_TIMEOUT_MS = 60000;
const SUGGESTIONS = [
  "Find candidates for this position.",
  "Find 10 strong technology sales candidates in Atlanta.",
  "Find people with CRM and payroll software experience.",
  "Find real estate photographers with drone certification.",
];

export default function RecruitingChat({ onClose, initialJobId, onProspectFound, onRefresh, onReviewProspects, initialInput }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hi! I'm Khetha, your Recruiting Assistant. Tell me what kind of talent you're looking for and I'll research the public market for potential candidates." },
  ]);
  const [input, setInput] = useState(initialInput || "");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState("25");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [teamMembers, setTeamMembers] = useState([]);
  const [similarTo, setSimilarTo] = useState("");
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.SalesTeamMember.list("-created_date", 100);
        const list = res?.data ?? res ?? [];
        setTeamMembers(list.filter(m => m.is_active));
      } catch {}
    })();
  }, []);

  const handleSend = async () => {
    const text = input;
    if (!text.trim() || loading) return;
    if (!zip.trim()) {
      setMessages(prev => [...prev, { role: "assistant", text: "Please enter a zip code so I can find local candidates for you." }]);
      return;
    }

    let query = text;
    if (similarTo) {
      const member = teamMembers.find(m => m.id === similarTo);
      if (member) {
        query = `${text} — find candidates similar to ${member.full_name}, who is a ${member.title || "sales rep"} in ${member.department || "Sales"}. Match their role, seniority, and skills.`;
      }
    }

    const fullQuery = `${query} (local to ${zip}, within ${radius} mi)`;
    setMessages(prev => [...prev, { role: "user", text: fullQuery }]);
    setInput("");
    setLoading(true);
    setResult(null);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

    try {
      const data = await new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error("timeout")); }
        }, RESEARCH_TIMEOUT_MS);
        naturalLanguageSearch({ input: query, zipCode: zip, radiusMiles: parseInt(radius, 10), jobId: initialJobId })
          .then(d => { if (!settled) { settled = true; clearTimeout(timeout); resolve(d); } })
          .catch(e => { if (!settled) { settled = true; clearTimeout(timeout); reject(e); } });
      });

      let response = "";
      if (data?.internal_matches?.length > 0) {
        response = `I found ${data.internal_matches.length} existing match(es) in your database:\n` +
          data.internal_matches.map(m => `• ${m.record?.full_name} — ${m.record?.current_title || ""} (${m.reason})`).join("\n");
      }
      if (data?.fresh_prospects?.length > 0) {
        response += (response ? "\n\n" : "") +
          `I also researched the public market and identified ${data.fresh_prospects.length} new prospect(s):\n` +
          data.fresh_prospects.map(p => `• ${p.full_name} — ${p.current_title} at ${p.current_company} (${p.sourcing_match_score}% match)`).join("\n");
      }
      if (!response) {
        const filtered = (data.seniority_filtered || 0) + (data.location_filtered || 0);
        response = data.needs_fresh_research
          ? `I researched but couldn't find strong public matches${filtered ? ` (${filtered} filtered out for seniority/location)` : ""}. Try refining your request — e.g. a specific location, title, or skill.`
          : "I couldn't find matches. Try rephrasing your request.";
      }

      setMessages(prev => [...prev, { role: "assistant", text: response }]);
      setResult({ internal: data.internal_matches || [], fresh: data.fresh_prospects || [], hasNew: (data.fresh_prospects?.length || 0) > 0 });
      onRefresh?.();
    } catch (err) {
      const msg = err?.message === "timeout"
        ? "I couldn't find new public prospects within the time limit. Try refining your request — e.g. a specific title, skill, or location."
        : "Sorry, I ran into an issue researching that. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", text: msg }]);
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(false);
    setSeconds(0);
  };

  return (
    <div className="bg-white border rounded-xl overflow-hidden mb-4" style={{ borderColor: "rgba(184,149,106,0.3)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ backgroundColor: "rgba(184,149,106,0.05)", borderColor: "rgba(184,149,106,0.15)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: GOLD }}>
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: TEXT_DARK }}>Recruiting Assistant</p>
            <p className="text-xs" style={{ color: MUTED }}>Researches public professional sources</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ color: "rgba(26,26,26,0.4)" }} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Chat messages */}
      <div className="max-h-72 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${m.role === "user" ? "text-white" : ""}`}
              style={m.role === "user"
                ? { backgroundColor: GOLD }
                : { backgroundColor: CREAM, color: "rgba(26,26,26,0.8)" }
              }
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg flex items-center gap-2" style={{ backgroundColor: CREAM }}>
              <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: GOLD }} />
              <span className="text-xs" style={{ color: MUTED }}>
                Researching the public market{seconds > 0 ? ` · ${seconds}s` : ""}…
              </span>
            </div>
          </div>
        )}
        {result?.fresh?.length > 0 && (
          <div className="space-y-1">
            {result.fresh.map(p => (
              <button
                key={p.id}
                onClick={() => onProspectFound?.(p.prospect_id)}
                className="block w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors"
                style={{ borderColor: "rgba(184,149,106,0.15)" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(184,149,106,0.4)"; e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(184,149,106,0.15)"; e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <span className="font-medium" style={{ color: TEXT_DARK }}>{p.full_name}</span>{" "}
                <span style={{ color: MUTED }}>— {p.current_title} at {p.current_company}</span>{" "}
                <span className="font-medium" style={{ color: GOLD }}>{p.sourcing_match_score}%</span>
              </button>
            ))}
          </div>
        )}
        {result && onReviewProspects && (
          <button
            onClick={onReviewProspects}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: GOLD }}
          >
            <Users className="w-4 h-4" />
            Review Prospects
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-3" style={{ borderColor: "rgba(184,149,106,0.1)" }}>
        {teamMembers.length > 0 && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs" style={{ color: MUTED }}>Find similar to:</span>
            <select
              value={similarTo}
              onChange={e => setSimilarTo(e.target.value)}
              className="text-xs px-2 py-1 border rounded-lg bg-white focus:outline-none"
              style={{ borderColor: "rgba(184,149,106,0.15)" }}
            >
              <option value="">No reference</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.full_name} — {m.title || "Sales"}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => setInput(s)}
              className="text-xs px-2 py-1 rounded-full transition-colors"
              style={{ backgroundColor: CREAM, color: "rgba(26,26,26,0.7)" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(184,149,106,0.15)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = CREAM}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Ask the Recruiting Assistant..."
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none"
            style={{ borderColor: "rgba(184,149,106,0.15)" }}
          />
          <input
            value={zip}
            onChange={e => setZip(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Zip *"
            className="w-16 px-2 py-2 border rounded-lg text-sm focus:outline-none"
            style={{ borderColor: "rgba(184,149,106,0.15)" }}
            title="Zip code (required) — prospects will be filtered to this area"
          />
          <select
            value={radius}
            onChange={e => setRadius(e.target.value)}
            className="px-2 py-2 border rounded-lg text-sm focus:outline-none bg-white"
            style={{ borderColor: "rgba(184,149,106,0.15)" }}
            title="Search radius in miles"
          >
            <option value="10">10 mi</option>
            <option value="25">25 mi</option>
            <option value="50">50 mi</option>
            <option value="100">100 mi</option>
          </select>
          <button
            onClick={handleSend}
            disabled={loading || !zip.trim()}
            className="px-3 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: GOLD }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {zip ? (
          <p className="text-xs mt-1" style={{ color: MUTED }}>Filtering prospects to within {radius} miles of {zip}.</p>
        ) : (
          <p className="text-xs mt-1 text-red-500">Enter a zip code to search for local candidates.</p>
        )}
      </div>
    </div>
  );
}