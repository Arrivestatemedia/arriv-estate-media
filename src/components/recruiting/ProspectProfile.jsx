import React, { useState, useEffect } from "react";
import { getProspectProfile, generateOutreachMessage, convertToCandidate, saveProspect, approveProspect } from "@/lib/recruitingApi";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ExternalLink, MapPin, Building2, Mail, FileText, UserPlus, Check, Sparkles, Clock } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

export default function ProspectProfile({ prospectId, onBack, onConverted }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [outreach, setOutreach] = useState("");
  const [generating, setGenerating] = useState(false);
  const [converting, setConverting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getProspectProfile(prospectId);
      setData(d);
      setOutreach(d.prospect?.outreach_message || "");
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { if (prospectId) load(); }, [prospectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await generateOutreachMessage(prospectId);
      setOutreach(res.message || "");
    } catch (_) {} finally { setGenerating(false); }
  };

  const handleConvert = async () => {
    setConverting(true);
    try {
      const res = await convertToCandidate(prospectId, data.prospect?.job_id);
      if (onConverted) onConverted(res.candidate_id);
    } catch (_) {} finally { setConverting(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  if (!data?.prospect) return <p style={{ color: MUTED }}>Prospect not found.</p>;

  const { prospect, activity } = data;

  return (
    <div className="max-w-4xl mx-auto">
      <Button variant="ghost" onClick={onBack} className="mb-4" style={{ color: MUTED }}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Prospects
      </Button>

      <div className="p-6 rounded-xl mb-5" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-2xl font-bold" style={{ ...SERIF, color: CREAM }}>{prospect.full_name}</h2>
            <p className="text-sm mt-1" style={{ color: "rgba(255,251,245,0.6)" }}>{prospect.current_title}</p>
            <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: "rgba(255,251,245,0.4)" }}>
              {prospect.current_company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {prospect.current_company}</span>}
              {prospect.public_location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {prospect.public_location}</span>}
            </div>
          </div>
          <span className="text-xs px-2 py-1 rounded font-medium capitalize" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>{prospect.status}</span>
        </div>

        {prospect.skills?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {prospect.skills.map((s, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(255,251,245,0.06)", color: "rgba(255,251,245,0.7)" }}>{s}</span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t" style={{ borderColor: "rgba(184,149,106,0.1)" }}>
          {prospect.linkedin_url && (
            <a href={prospect.linkedin_url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="border-[#B8956A]/30 text-[#FFFBF5]">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> LinkedIn
              </Button>
            </a>
          )}
          {prospect.status === "new" && (
            <Button size="sm" onClick={async () => { await saveProspect(prospect.id); load(); }} style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>
              <Check className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          )}
          {prospect.status === "saved" && (
            <Button size="sm" onClick={async () => { await approveProspect(prospect.id); load(); }} style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>
              <Check className="w-3.5 h-3.5 mr-1" /> Approve
            </Button>
          )}
          <Button size="sm" onClick={handleConvert} disabled={converting} variant="outline" className="border-[#B8956A]/30 text-[#FFFBF5]">
            {converting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />} Convert to Candidate
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Source Evidence */}
        <div className="p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <h3 className="font-bold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>Source Evidence</h3>
          {prospect.source_records?.length > 0 ? (
            <div className="space-y-2">
              {prospect.source_records.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block p-3 rounded-lg transition-colors hover:bg-[#B8956A]/5" style={{ backgroundColor: "rgba(184,149,106,0.05)", border: "1px solid rgba(184,149,106,0.15)" }}>
                  <p className="text-sm font-medium" style={{ color: TEXT_DARK }}>{s.title || s.url}</p>
                  {s.snippet && <p className="text-xs mt-1" style={{ color: MUTED }}>{s.snippet}</p>}
                  <p className="text-xs mt-1 break-all" style={{ color: GOLD }}>{s.url}</p>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>No source records available.</p>
          )}

          {prospect.contact_records?.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
              <h4 className="text-sm font-medium mb-2" style={{ color: TEXT_DARK }}>Contact Records</h4>
              {prospect.contact_records.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm mb-1" style={{ color: MUTED }}>
                  <Mail className="w-3 h-3" /> {c.type}: {c.value}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outreach + Activity */}
        <div className="space-y-5">
          <div className="p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Outreach Message</h3>
              <Button size="sm" onClick={handleGenerate} disabled={generating} variant="outline" style={{ borderColor: GOLD, color: GOLD }}>
                {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />} Generate
              </Button>
            </div>
            {outreach ? (
              <textarea value={outreach} onChange={(e) => setOutreach(e.target.value)} rows={6}
                className="w-full p-3 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#B8956A]"
                style={{ borderColor: "rgba(184,149,106,0.2)", color: TEXT_DARK }} />
            ) : (
              <p className="text-sm" style={{ color: MUTED }}>Click "Generate" to draft a personalized outreach message.</p>
            )}
          </div>

          <div className="p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
            <h3 className="font-bold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>Activity Log</h3>
            {activity?.length > 0 ? (
              <div className="space-y-2">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Clock className="w-3 h-3 mt-1 shrink-0" style={{ color: GOLD }} />
                    <div>
                      <p style={{ color: TEXT_DARK }}>{a.description || a.type}</p>
                      <p className="text-xs" style={{ color: MUTED }}>{a.actor} · {new Date(a.created_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm" style={{ color: MUTED }}>No activity yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}