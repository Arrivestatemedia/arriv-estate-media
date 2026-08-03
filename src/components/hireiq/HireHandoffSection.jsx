import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, UserPlus, Link2, AlertCircle, Briefcase, User } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const innerBg = "#2A2A2A";

export default function HireHandoffSection({ candidate, job, onCandidateUpdated }) {
  const [handoff, setHandoff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [linkType, setLinkType] = useState("media_specialist");

  const loadHandoff = async () => {
    if (!candidate?.id) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageHireHandoff", {
        action: "get_handoff",
        candidateId: candidate.id,
      });
      setHandoff(res?.data?.handoff || res?.handoff || null);
    } catch (_) {
      setHandoff(null);
    }
    setLoading(false);
  };

  useEffect(() => { loadHandoff(); }, [candidate?.id]);

  const handleHire = async () => {
    if (!confirm("This will mark the candidate as hired and create/link their Estate Media worker record. Continue?")) return;
    setProcessing(true);
    try {
      const res = await base44.functions.invoke("manageHireHandoff", {
        action: "process_hire",
        candidateId: candidate.id,
      });
      const data = res?.data || res;
      if (data.success !== false) {
        await loadHandoff();
        onCandidateUpdated?.({ ...candidate, status: "hired", handoff_status: data.status || "completed" });
      } else {
        alert(data.error || "Handoff failed.");
      }
    } catch (err) {
      alert(err.message || "Handoff failed.");
    }
    setProcessing(false);
  };

  const handleLink = async () => {
    if (!linkId.trim()) return;
    setProcessing(true);
    try {
      const res = await base44.functions.invoke("manageHireHandoff", {
        action: "link_existing",
        candidateId: candidate.id,
        estateRecordId: linkId.trim(),
        estateRecordType: linkType,
      });
      const data = res?.data || res;
      if (data.success !== false) {
        await loadHandoff();
        setShowLink(false);
        onCandidateUpdated?.({ ...candidate, status: "hired", handoff_status: "completed" });
      } else {
        alert(data.error || "Link failed.");
      }
    } catch (err) {
      alert(err.message || "Link failed.");
    }
    setProcessing(false);
  };

  const targetRole = candidate?.target_role || job?.source_application_position || "other";
  const roleLabel = targetRole === "media_specialist" ? "Media Specialist" : targetRole === "sales_growth_advisor" ? "Sales Growth Advisor" : "Estate Media Role";
  const isHired = candidate?.status === "hired" || candidate?.decision === "offer";
  const handoffCompleted = handoff?.handoff_status === "completed" || handoff?.handoff_status === "invited";

  if (loading) {
    return (
      <div className="p-5" style={card}>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: GOLD }} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-5" style={card}>
      <h3 className="font-bold mb-1 flex items-center gap-2" style={{ ...SERIF, color: CREAM }}>
        <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
        Estate Media Handoff
      </h3>
      <p className="text-xs mb-4" style={{ color: MUTED_LIGHT }}>
        Bridge this KhethaIQ candidate to an Estate Media {roleLabel} record. KhethaIQ remains authoritative for recruiting; Estate Media becomes authoritative after hire.
      </p>

      {/* Target role badge */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs" style={{ color: MUTED_LIGHT }}>Target role:</span>
        <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
          {roleLabel}
        </span>
      </div>

      {/* Handoff status */}
      {handoff && handoffCompleted ? (
        <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5" style={{ color: GOLD }} />
            <span className="font-medium text-sm" style={{ color: CREAM }}>
              {handoff.handoff_status === "invited" ? "Invited to Estate Media" : "Handoff Complete"}
            </span>
          </div>
          <div className="space-y-1 text-xs" style={{ color: MUTED_LIGHT }}>
            {handoff.handoff_id && <div>Handoff ID: <span style={{ fontFamily: "'SF Mono', monospace", color: CREAM }}>{handoff.handoff_id}</span></div>}
            {handoff.shared_person_id && <div>Shared Person ID: <span style={{ fontFamily: "'SF Mono', monospace", color: CREAM }}>{handoff.shared_person_id}</span></div>}
            {handoff.estate_media_specialist_id && <div>Media Specialist ID: <span style={{ fontFamily: "'SF Mono', monospace", color: CREAM }}>{handoff.estate_media_specialist_id}</span></div>}
            {handoff.estate_employee_id && <div>Employee ID: <span style={{ fontFamily: "'SF Mono', monospace", color: CREAM }}>{handoff.estate_employee_id}</span></div>}
            {handoff.linked_record && (
              <div className="mt-2 p-2 rounded" style={{ backgroundColor: "rgba(184,149,106,0.08)" }}>
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3" style={{ color: GOLD }} />
                  <span style={{ color: CREAM }}>{handoff.linked_record.name}</span>
                  <span style={{ color: MUTED_LIGHT }}>· {handoff.linked_record.email}</span>
                </div>
                <div className="mt-0.5" style={{ color: MUTED_LIGHT }}>
                  Status: {handoff.linked_record.is_active === true || handoff.linked_record.is_active === "active" ? "Active" : "Pending"}
                </div>
              </div>
            )}
            {handoff.handoff_completed_at && <div>Completed: {new Date(handoff.handoff_completed_at).toLocaleString()}</div>}
          </div>
        </div>
      ) : handoff?.handoff_status === "failed" ? (
        <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: innerBg, border: "1px solid rgba(220,38,38,0.3)" }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-5 h-5" style={{ color: "#FCA5A5" }} />
            <span className="font-medium text-sm" style={{ color: "#FCA5A5" }}>Handoff Failed</span>
          </div>
          {handoff.handoff_error && <p className="text-xs" style={{ color: MUTED_LIGHT }}>{handoff.handoff_error}</p>}
        </div>
      ) : null}

      {/* Actions */}
      {!handoffCompleted && (
        <div className="space-y-2">
          {isHired ? (
            <Button onClick={handleHire} disabled={processing} className="w-full"
              style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600 }}>
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              {targetRole === "sales_growth_advisor" ? "Create Sales Rep Record" : "Invite to Estate Media"}
            </Button>
          ) : (
            <p className="text-xs text-center py-2" style={{ color: MUTED_LIGHT }}>
              Set the candidate's decision to "Offer Position" to enable the handoff.
            </p>
          )}

          <Button variant="outline" onClick={() => setShowLink(!showLink)} className="w-full"
            style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
            <Link2 className="w-4 h-4 mr-2" />
            Link Existing Record
          </Button>

          {showLink && (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.12)" }}>
              <select value={linkType} onChange={e => setLinkType(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
                <option value="media_specialist">Media Specialist (User ID)</option>
                <option value="sales_rep">Sales Rep (SalesTeamMember ID)</option>
              </select>
              <input type="text" value={linkId} onChange={e => setLinkId(e.target.value)}
                placeholder="Paste existing record ID..."
                className="w-full px-3 py-2 rounded text-sm"
                style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }} />
              <Button size="sm" onClick={handleLink} disabled={processing || !linkId.trim()} className="w-full"
                style={{ backgroundColor: GOLD_DARK, color: CREAM, border: "none", fontWeight: 600 }}>
                {processing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
                Confirm Link
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}