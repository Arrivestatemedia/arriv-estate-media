import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Video, AlertTriangle, Sparkles, ListChecks, MessageSquare, Target, Building2, MapPin, ExternalLink, RefreshCw, X } from "lucide-react";

const VIDEO_STATUS_CONFIG = {
  UNKNOWN: { label: "Unknown", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
  NO_PROFESSIONAL_VIDEO: { label: "No Pro Video", color: "#B8956A", bg: "rgba(184,149,106,0.15)" },
  PROFESSIONAL_VIDEO_PRESENT: { label: "Pro Video Present", color: "#1A1A1A", bg: "rgba(26,26,26,0.08)" },
  COMING_SOON_NO_MEDIA: { label: "Coming Soon — No Media", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  MEDIA_NOT_YET_VERIFIABLE: { label: "Media Not Yet Verifiable", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const CONFIDENCE_CONFIG = {
  HIGH: { color: "#15803d" },
  MODERATE: { color: "#B8956A" },
  LOW: { color: "#dc2626" },
  UNKNOWN: { color: "#6b7280" },
};

export default function ProspectBriefPanel({ prospect, salesMemberId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState(null);
  const [briefId, setBriefId] = useState(null);
  const [error, setError] = useState("");
  const [repNotes, setRepNotes] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    setBrief(null);
    try {
      const res = await base44.functions.invoke("generateEstateMediaProspectBrief", {
        sales_member_id: salesMemberId,
        prospect_name: prospect.name,
        prospect_brokerage: prospect.brokerage || "",
        prospect_location: prospect.market || prospect.location || "",
        listing_address: prospect.listing_address || "",
        prospect_phone: prospect.phone && !prospect.phone.toLowerCase().includes("not found") ? prospect.phone : "",
        prospect_email: prospect.email && !prospect.email.toLowerCase().includes("not found") ? prospect.email : "",
        prospect_website: prospect.website && !prospect.website.toLowerCase().includes("not found") ? prospect.website : "",
        contact_id: prospect.contact_id || "",
      });
      setBrief(res.data?.brief || null);
      setBriefId(res.data?.saved_brief_id || null);
    } catch (e) {
      setError(e?.message || "Failed to generate prospect brief");
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = async () => {
    if (!brief || !repNotes.trim()) return;
    try {
      if (briefId) {
        await base44.entities.ProspectBrief.update(briefId, { rep_notes: repNotes });
      }
      setBrief({ ...brief, rep_notes: repNotes });
    } catch (e) {
      // Non-blocking — notes are advisory
    }
  };

  const videoConfig = brief ? VIDEO_STATUS_CONFIG[brief.professional_video_status] || VIDEO_STATUS_CONFIG.UNKNOWN : null;
  const confConfig = brief ? CONFIDENCE_CONFIG[brief.research_confidence] || CONFIDENCE_CONFIG.UNKNOWN : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#1A1A1A] text-white px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" style={{ color: "#B8956A" }} />
            <div>
              <h3 className="font-bold text-base">Prospect Brief / Call Prep</h3>
              <p className="text-xs opacity-60">Estate Media — powered by Arriv One research</p>
            </div>
          </div>
          <button onClick={onClose} className="opacity-70 hover:opacity-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Prospect summary */}
          <div className="rounded-lg border p-4" style={{ borderColor: "rgba(184,149,106,0.25)", backgroundColor: "rgba(184,149,106,0.04)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4" style={{ color: "#B8956A" }} />
              <span className="font-semibold text-sm" style={{ color: "#1A1A1A" }}>{prospect.name}</span>
            </div>
            {prospect.brokerage && (
              <p className="text-xs flex items-center gap-1.5 mb-1" style={{ color: "rgba(26,26,26,0.6)" }}>
                <Building2 className="w-3.5 h-3.5" /> {prospect.brokerage}
              </p>
            )}
            {(prospect.market || prospect.location) && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: "rgba(26,26,26,0.6)" }}>
                <MapPin className="w-3.5 h-3.5" /> {prospect.market || prospect.location}
              </p>
            )}
            {prospect.listing_address && (
              <p className="text-xs mt-1.5 italic" style={{ color: "rgba(26,26,26,0.5)" }}>
                Trigger listing: {prospect.listing_address}
              </p>
            )}
          </div>

          {/* Generate button / loading */}
          {!brief && !loading && !error && (
            <div className="text-center py-8">
              <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: "#B8956A" }} />
              <p className="text-sm mb-4" style={{ color: "rgba(26,26,26,0.7)" }}>
                Generate a research-backed prospect brief with listing intelligence, professional video check, and a personalized opening.
              </p>
              <Button onClick={generate} style={{ backgroundColor: "#B8956A", color: "#1A1A1A" }} className="gap-2">
                <Sparkles className="w-4 h-4" /> Generate Prospect Brief
              </Button>
              <p className="text-xs mt-3" style={{ color: "rgba(26,26,26,0.45)" }}>
                Uses Arriv One's research engine with web search. Takes ~10-15 seconds.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#B8956A" }} />
              <p className="mt-3 text-sm" style={{ color: "rgba(26,26,26,0.6)" }}>Researching prospect…</p>
              <p className="mt-1 text-xs" style={{ color: "rgba(26,26,26,0.45)" }}>
                Scanning listings, brokerage, and media presence
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
              <Button size="sm" variant="outline" onClick={generate} className="mt-2 gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </Button>
            </div>
          )}

          {/* Brief content */}
          {brief && (
            <div className="space-y-4">
              {/* Confidence + video status badges */}
              <div className="flex flex-wrap items-center gap-2">
                {videoConfig && (
                  <Badge className="gap-1.5" style={{ backgroundColor: videoConfig.bg, color: videoConfig.color }}>
                    <Video className="w-3.5 h-3.5" /> {videoConfig.label}
                  </Badge>
                )}
                {confConfig && (
                  <Badge variant="outline" className="gap-1.5" style={{ color: confConfig.color, borderColor: confConfig.color }}>
                    Confidence: {brief.research_confidence}
                  </Badge>
                )}
              </div>

              {/* Why Them */}
              <Section title="Why Them" icon={Target}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.8)" }}>{brief.why_them}</p>
              </Section>

              {/* Why This Business */}
              <Section title="Why This Business" icon={Building2}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.8)" }}>{brief.why_this_business}</p>
              </Section>

              {/* Listing Intelligence */}
              <Section title="Listing Intelligence" icon={ListChecks}>
                <p className="text-sm leading-relaxed mb-2" style={{ color: "rgba(26,26,26,0.8)" }}>{brief.listing_intelligence}</p>
                <div className="flex flex-wrap gap-2">
                  {brief.listing_price_range && (
                    <Badge variant="outline" className="text-xs">Price Range: {brief.listing_price_range}</Badge>
                  )}
                  {brief.listing_activity_volume && (
                    <Badge variant="outline" className="text-xs">Activity: {brief.listing_activity_volume}</Badge>
                  )}
                </div>
              </Section>

              {/* Media Audit */}
              <Section title="Media Audit" icon={FileText}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.8)" }}>{brief.media_audit}</p>
              </Section>

              {/* Professional Video Check */}
              <Section title="Professional Video Check" icon={Video}>
                <div className="rounded-lg p-3" style={{ backgroundColor: videoConfig?.bg || "rgba(107,114,128,0.08)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: videoConfig?.color || "#1A1A1A" }}>
                    {videoConfig?.label || "Unknown"}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "rgba(26,26,26,0.7)" }}>
                    {brief.professional_video_notes}
                  </p>
                </div>
              </Section>

              {/* Potential Opportunity */}
              <Section title="Potential Opportunity" icon={Sparkles}>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(26,26,26,0.8)" }}>{brief.potential_opportunity}</p>
              </Section>

              {/* Suggested Opening */}
              <Section title="Suggested Opening" icon={MessageSquare}>
                <div className="rounded-lg p-3 border-l-4" style={{ backgroundColor: "rgba(184,149,106,0.06)", borderColor: "#B8956A" }}>
                  <p className="text-sm leading-relaxed italic" style={{ color: "rgba(26,26,26,0.85)" }}>
                    "{brief.suggested_opening}"
                  </p>
                </div>
              </Section>

              {/* Questions to Ask */}
              <Section title="Questions to Ask" icon={ListChecks}>
                <ul className="space-y-1.5">
                  {(brief.questions_to_ask || []).map((q, i) => (
                    <li key={i} className="text-sm leading-relaxed flex items-start gap-2" style={{ color: "rgba(26,26,26,0.8)" }}>
                      <span className="text-xs font-bold mt-1" style={{ color: "#B8956A" }}>{i + 1}.</span>
                      <span>{q}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Likely Objections */}
              <Section title="Likely Objections" icon={AlertTriangle}>
                <ul className="space-y-1.5">
                  {(brief.likely_objections || []).map((o, i) => (
                    <li key={i} className="text-sm leading-relaxed flex items-start gap-2" style={{ color: "rgba(26,26,26,0.8)" }}>
                      <span className="text-xs mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#dc2626" }} />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Staging boundary */}
              {brief.staging_interest_signal && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800">Staging Interest Signal Detected</span>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">{brief.staging_boundary_note}</p>
                </div>
              )}

              {/* Research sources */}
              <Section title="Research Sources (Verify Before Calling)" icon={ExternalLink}>
                {(brief.research_sources || []).length > 0 ? (
                  <ul className="space-y-1">
                    {brief.research_sources.map((s, i) => (
                      <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: "rgba(26,26,26,0.65)" }}>
                        <span className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs italic" style={{ color: "rgba(26,26,26,0.45)" }}>No specific sources returned — verify research independently.</p>
                )}
              </Section>

              {/* Rep notes */}
              <Section title="Rep Notes" icon={FileText}>
                <textarea
                  value={repNotes || brief.rep_notes || ""}
                  onChange={(e) => setRepNotes(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Add your own observations about this prospect…"
                  className="w-full rounded-md border p-2.5 text-sm resize-none"
                  style={{ borderColor: "rgba(184,149,106,0.3)", minHeight: "70px" }}
                />
              </Section>

              {/* Regenerate */}
              <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "rgba(184,149,106,0.15)" }}>
                <p className="text-xs" style={{ color: "rgba(26,26,26,0.45)" }}>
                  VERIFY research before calling — do not blindly trust AI.
                </p>
                <Button size="sm" variant="outline" onClick={generate} disabled={loading} className="gap-2" style={{ borderColor: "#B8956A", color: "#B8956A" }}>
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Regenerate
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: "#B8956A" }} />
        <h4 className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{title}</h4>
      </div>
      {children}
    </div>
  );
}