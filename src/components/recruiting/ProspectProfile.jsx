import React, { useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, MapPin, Briefcase, Save, Check, X, MessageSquare, UserPlus, FileText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { saveProspect, dismissProspect, approveProspect, generateOutreachMessage, convertToCandidate, updateProspectNotes, listActivity } from "@/lib/recruitingApi";
import { toast } from "sonner";

export default function ProspectProfile({ prospectId, onBack }) {
  const [prospect, setProspect] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [outreachMsg, setOutreachMsg] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const p = await base44.entities.RecruitingProspect.get(prospectId);
      setProspect(p);
      setNotes(p.notes || "");
      setOutreachMsg(p.outreach_message || "");
      const actRes = await listActivity({ prospectId, limit: 20 });
      setActivity(actRes.activity || []);
    } catch (e) {
      toast.error("Failed to load prospect");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [prospectId]);

  const handleSave = async () => {
    try {
      await saveProspect(prospectId);
      toast.success("Saved");
      load();
    } catch (e) {
      toast.error("Failed to save");
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissProspect(prospectId);
      toast.success("Dismissed");
      onBack?.();
    } catch (e) {
      toast.error("Failed to dismiss");
    }
  };

  const handleApprove = async () => {
    try {
      await approveProspect(prospectId);
      toast.success("Approved for outreach");
      load();
    } catch (e) {
      toast.error("Failed to approve");
    }
  };

  const handleGenerateOutreach = async () => {
    setGenerating(true);
    try {
      const res = await generateOutreachMessage(prospectId);
      setOutreachMsg(res.message);
      toast.success("Outreach message generated");
    } catch (e) {
      toast.error("Failed to generate message");
    } finally {
      setGenerating(false);
    }
  };

  const handleConvert = async () => {
    try {
      await convertToCandidate(prospectId, prospect.job_id);
      toast.success("Converted to candidate in HireIQ");
      load();
    } catch (e) {
      toast.error(e.message || "Failed to convert");
    }
  };

  const handleSaveNotes = async () => {
    try {
      await updateProspectNotes(prospectId, notes);
      toast.success("Notes saved");
    } catch (e) {
      toast.error("Failed to save notes");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="flex items-center justify-center h-full text-[#1A1A1A]/50">
        Prospect not found
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5]">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-[#B8956A]/20 px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-[#1A1A1A]/60">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-full bg-[#B8956A]/15 flex items-center justify-center shrink-0">
              <span className="text-lg font-semibold text-[#B8956A]">
                {(prospect.name || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-[#1A1A1A] truncate">{prospect.name}</h1>
              <p className="text-sm text-[#1A1A1A]/60 truncate">
                {prospect.title} {prospect.company && `· ${prospect.company}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {prospect.status === "new" && (
              <>
                <Button onClick={handleSave} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                  <Save className="w-4 h-4 mr-1.5" /> Save
                </Button>
                <Button variant="outline" onClick={handleDismiss} className="border-[#B8956A]/20">
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
            {prospect.status === "saved" && (
              <Button onClick={handleApprove} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                <Check className="w-4 h-4 mr-1.5" /> Approve
              </Button>
            )}
            {prospect.status === "approved" && (
              <Button onClick={handleConvert} className="bg-[#1A1A1A] hover:bg-[#2A3536] text-white">
                <UserPlus className="w-4 h-4 mr-1.5" /> Convert to Candidate
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-4 h-4 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm">Professional</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[#1A1A1A]/50">Title</dt>
                <dd className="text-[#1A1A1A]">{prospect.title || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#1A1A1A]/50">Company</dt>
                <dd className="text-[#1A1A1A]">{prospect.company || "—"}</dd>
              </div>
              <div>
                <dt className="text-[#1A1A1A]/50">Location</dt>
                <dd className="text-[#1A1A1A] flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#B8956A]" />
                  {prospect.location || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#1A1A1A]/50">Seniority Level</dt>
                <dd className="text-[#1A1A1A]">{prospect.seniority_level ?? "—"}/5</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm">Links</h3>
            </div>
            <div className="space-y-2">
              {prospect.linkedin_url && (
                <a
                  href={prospect.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#B8956A] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  LinkedIn Profile
                </a>
              )}
              {prospect.source_url && (
                <a
                  href={prospect.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#B8956A] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Source
                </a>
              )}
              {!prospect.linkedin_url && !prospect.source_url && (
                <p className="text-sm text-[#1A1A1A]/50">No links available</p>
              )}
            </div>
          </div>
        </div>

        {/* Skills */}
        {prospect.skills && prospect.skills.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <h3 className="font-semibold text-[#1A1A1A] text-sm mb-3">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {prospect.skills.map((s, i) => (
                <span key={i} className="px-3 py-1 rounded-full text-sm bg-[#FFFBF5] text-[#1A1A1A] border border-[#B8956A]/20">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Source evidence */}
        {prospect.source_records && prospect.source_records.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <h3 className="font-semibold text-[#1A1A1A] text-sm mb-3">Source Evidence</h3>
            <div className="space-y-3">
              {prospect.source_records.map((src, i) => (
                <div key={i} className="border-l-2 border-[#B8956A] pl-3">
                  {src.snippet && <p className="text-sm text-[#1A1A1A]/70 italic">"{src.snippet}"</p>}
                  {src.url && (
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#B8956A] hover:underline break-all">
                      {src.url}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outreach message */}
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm">Outreach Message</h3>
            </div>
            <Button size="sm" variant="outline" onClick={handleGenerateOutreach} disabled={generating} className="border-[#B8956A]/20">
              {generating ? "Generating..." : "Generate"}
            </Button>
          </div>
          {outreachMsg ? (
            <Textarea value={outreachMsg} onChange={(e) => setOutreachMsg(e.target.value)} className="min-h-[120px] bg-[#FFFBF5]" />
          ) : (
            <p className="text-sm text-[#1A1A1A]/50">Click "Generate" to create a personalized outreach message.</p>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[#1A1A1A] text-sm">Internal Notes</h3>
            <Button size="sm" variant="outline" onClick={handleSaveNotes} className="border-[#B8956A]/20">
              Save Notes
            </Button>
          </div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this prospect..." className="min-h-[80px] bg-[#FFFBF5]" />
        </div>

        {/* Activity log */}
        {activity.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm">Activity Log</h3>
            </div>
            <div className="space-y-2">
              {activity.map((a, i) => (
                <div key={a.id || i} className="flex items-start gap-2 text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B8956A] mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <span className="text-[#1A1A1A] capitalize">{a.type.replace(/_/g, " ")}</span>
                    {a.actor && <span className="text-[#1A1A1A]/50"> · {a.actor}</span>}
                    {a.new_value && <span className="text-[#1A1A1A]/50"> → {a.new_value}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}