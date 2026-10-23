import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ClipboardCopy, ExternalLink, FileText, Link2, Loader2, MessageSquare, RefreshCw, ShieldOff } from "lucide-react";
import moment from "moment";

/**
 * Indeed Fast-Track controls for an imported applicant: the résumé facts that
 * were read, the personalized Careers Profile link, and the applicant's place in
 * the Khetha IQ evaluation pipeline.
 */
export default function IndeedFastTrackPanel({ app }) {
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [linkState, setLinkState] = useState(() =>
    app.careers_profile_token && !app.careers_profile_link_revoked_at ? "active" : "none",
  );
  const [busy, setBusy] = useState("");
  const [confirming, setConfirming] = useState("");
  const [candidate, setCandidate] = useState(null);

  const completed = app.profile_completion_status === "completed";

  useEffect(() => {
    let alive = true;
    if (!app.hire_candidate_id) return undefined;
    (async () => {
      try {
        const rec = await base44.entities.HireCandidate.get(app.hire_candidate_id);
        if (alive) setCandidate(rec);
      } catch (err) {
        /* no candidate record yet */
      }
    })();
    return () => {
      alive = false;
    };
  }, [app.hire_candidate_id]);

  const callLink = async (action) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke("importIndeedApplicant", {
        action,
        application_id: app.id,
      });
      return res.data || {};
    } finally {
      setBusy("");
    }
  };

  const copyText = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch (err) {
      toast.error("Copy failed — select the text and copy it manually.");
    }
  };

  const handleCopyLink = async () => {
    try {
      const data = await callLink("get_link");
      setLink(data.link || "");
      setMessage(data.invitation_message || "");
      setLinkState(data.link_state || "none");
      if (!data.link) {
        toast.error("There is no active link for this applicant. Generate a new one.");
        return;
      }
      await copyText(data.link, "Link");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not load the applicant's link.");
    }
  };

  const handleCopyMessage = async () => {
    try {
      const data = await callLink("get_link");
      setLink(data.link || "");
      setMessage(data.invitation_message || "");
      setLinkState(data.link_state || "none");
      if (!data.invitation_message) {
        toast.error("There is no active link for this applicant. Generate a new one.");
        return;
      }
      await copyText(data.invitation_message, "Indeed message");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not load the Indeed message.");
    }
  };

  const handleRegenerate = async () => {
    try {
      const data = await callLink("regenerate_link");
      setLink(data.link || "");
      setMessage(data.invitation_message || "");
      setLinkState(data.link_state || "active");
      setConfirming("");
      toast.success("New link generated — the previous link no longer works.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not generate a new link.");
    }
  };

  const handleRevoke = async () => {
    try {
      await callLink("revoke_link");
      setLink("");
      setMessage("");
      setLinkState("revoked");
      setConfirming("");
      toast.success("The applicant's link has been revoked.");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Could not revoke the link.");
    }
  };

  const extract = app.resume_extract || {};
  const evaluation = candidate?.evaluation || {};
  const uncertain = extract.uncertain_fields || [];

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.35)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCopy className="w-4 h-4 text-[#B8956A]" />
          <p className="text-sm font-semibold text-[#1A1A1A]">Indeed Fast-Track</p>
        </div>
        {completed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[#B8956A]/15 text-[#1A1A1A]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#B8956A]" />
            Careers Profile completed
            {app.profile_completed_at ? ` · ${moment(app.profile_completed_at).format("MMM D, YYYY")}` : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
            <AlertCircle className="w-3.5 h-3.5" />
            Awaiting Careers Profile completion
          </span>
        )}
      </div>

      {/* Résumé facts read at import */}
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="w-4 h-4 text-[#B8956A]" />
          <span className="font-medium text-[#1A1A1A]">{app.resume_file_name || "Résumé"}</span>
          {app.portfolio_link && (
            <a
              href={app.portfolio_link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#B8956A] underline"
            >
              Open résumé <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {extract.summary && (
          <p className="text-[#1A1A1A]/70 whitespace-pre-wrap text-xs border-l-2 border-[#B8956A]/40 pl-3">
            {extract.summary}
          </p>
        )}

        {(extract.work_history || []).length > 0 && (
          <div className="text-xs text-[#1A1A1A]/70">
            <p className="font-medium text-[#1A1A1A]">Work history read from résumé</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {extract.work_history.slice(0, 5).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {(extract.skills || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {extract.skills.slice(0, 12).map((skill, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#B8956A]/12 text-[#1A1A1A]/70">
                {skill}
              </span>
            ))}
          </div>
        )}

        {uncertain.length > 0 && (
          <p className="text-xs text-amber-800">
            Unclear on the résumé, the applicant confirms it: {uncertain.join(", ")}.
          </p>
        )}
      </div>

      {/* Khetha IQ position */}
      <div className="text-xs text-[#1A1A1A]/70 border-t border-[#B8956A]/20 pt-3">
        {candidate ? (
          <p>
            <span className="font-medium text-[#1A1A1A]">Khetha IQ: </span>
            {typeof evaluation.overall_match_score === "number"
              ? `overall match ${Math.round(evaluation.overall_match_score)}/100`
              : "résumé analysis pending"}
            {evaluation.proceed_recommendation ? ` · ${evaluation.proceed_recommendation}` : ""}
          </p>
        ) : (
          <p>Khetha IQ evaluation is being prepared for this applicant.</p>
        )}
      </div>

      {/* Link controls */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#B8956A]/20 pt-3">
        {linkState === "active" ? (
          <>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#B8956A] text-[#B8956A] disabled:opacity-60"
            >
              {busy === "get_link" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Copy link
            </button>
            <button
              type="button"
              onClick={handleCopyMessage}
              disabled={!!busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#B8956A] text-[#B8956A] disabled:opacity-60"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Copy Indeed message
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#B8956A] text-white disabled:opacity-60"
          >
            {busy === "regenerate_link" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Generate personalized link
          </button>
        )}

        {linkState === "active" && (
          <button
            type="button"
            onClick={() => setConfirming("regenerate")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#1A1A1A]/20 text-[#1A1A1A] disabled:opacity-60"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
        )}

        {linkState === "active" && (
          <button
            type="button"
            onClick={() => setConfirming("revoke")}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-300 text-red-600 disabled:opacity-60"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Revoke link
          </button>
        )}

        {linkState !== "active" && (
          <span className="text-xs text-[#1A1A1A]/60">
            {linkState === "revoked" ? "Link revoked." : "No active link."}
          </span>
        )}
      </div>

      {confirming === "regenerate" && (
        <div className="text-xs flex flex-wrap items-center gap-2 text-[#1A1A1A]/80 bg-amber-50 rounded-lg p-2">
          <span>Generate a new link? The link already sent stops working.</span>
          <button onClick={handleRegenerate} className="px-3 py-1 rounded-lg bg-[#B8956A] text-white font-medium">
            Yes, generate
          </button>
          <button onClick={() => setConfirming("")} className="px-3 py-1 rounded-lg border border-[#1A1A1A]/20">
            Cancel
          </button>
        </div>
      )}

      {confirming === "revoke" && (
        <div className="text-xs flex flex-wrap items-center gap-2 text-[#1A1A1A]/80 bg-red-50 rounded-lg p-2">
          <span>Revoke this applicant's link? They will not be able to open their Careers Profile.</span>
          <button onClick={handleRevoke} className="px-3 py-1 rounded-lg bg-red-600 text-white font-medium">
            Yes, revoke
          </button>
          <button onClick={() => setConfirming("")} className="px-3 py-1 rounded-lg border border-[#1A1A1A]/20">
            Cancel
          </button>
        </div>
      )}

      {app.careers_profile_token_expires_at && linkState === "active" && (
        <p className="text-[11px] text-[#1A1A1A]/55">
          Current link created {app.careers_profile_token_created_at ? moment(app.careers_profile_token_created_at).format("MMM D, YYYY") : "—"} · expires{" "}
          {moment(app.careers_profile_token_expires_at).format("MMM D, YYYY")}
        </p>
      )}
    </div>
  );
}