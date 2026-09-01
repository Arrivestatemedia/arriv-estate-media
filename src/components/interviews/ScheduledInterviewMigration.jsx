import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, RefreshCw, CalendarClock, AlertTriangle, CheckCircle2, XCircle, Brain, Video, ArrowRight, Shield, Mail } from "lucide-react";

const SCHEDULED_EXECUTION_TIME = "September 1, 2026 at 7:30 AM ET";
const SCHEDULED_EXECUTION_ISO = "2026-09-01T11:30:00Z";

export default function ScheduledInterviewMigration() {
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState([]);
  const [ineligible, setIneligible] = useState([]);
  const [summary, setSummary] = useState(null);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [authorizedBatch, setAuthorizedBatch] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [singleResult, setSingleResult] = useState(null);

  const fetchEligible = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("listEligibleScheduledInterviews", {
        includeIneligible: true,
      });
      const data = res?.data ?? res;
      setEligible(data?.eligible || []);
      setIneligible(data?.ineligible || []);
      setSummary(data?.summary || null);
    } catch (err) {
      console.error("Failed to load eligible interviews:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEligible(); }, [fetchEligible]);

  const toggleExclude = (id) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = eligible.filter(e => !excludedIds.has(e.conferenceId)).length;
  const selectedInterviews = eligible.filter(e => !excludedIds.has(e.conferenceId));

  const handleAuthorizeBulk = async () => {
    setAuthorizing(true);
    try {
      const adminName = localStorage.getItem("sales_member_name") || sessionStorage.getItem("sales_member_name") || "admin";
      const batch = await base44.functions.invoke("authorizeAsyncConversionBatch", {
        batch_name: `Scheduled Interview Migration — ${new Date().toLocaleDateString()}`,
        conference_ids: selectedInterviews.map(s => s.conferenceId),
        excluded_conference_ids: eligible.filter(e => excludedIds.has(e.conferenceId)).map(e => e.conferenceId),
        scheduled_for: SCHEDULED_EXECUTION_ISO,
        authorized_by: adminName,
        total_count: selectedCount,
      });
      setAuthorizedBatch(batch?.data ?? batch);
      setShowConfirm(false);
    } catch (err) {
      console.error("Failed to authorize batch:", err);
      alert("Failed to authorize batch: " + (err.message || "Unknown error"));
    } finally {
      setAuthorizing(false);
    }
  };

  const handleSingleConvert = async (conf) => {
    if (!confirm(
      `Convert ${conf.candidateName}'s scheduled interview to asynchronous?\n\n` +
      `This will:\n` +
      `• Cancel their scheduled appointment\n` +
      `• Create a 48-hour async interview link\n` +
      `• Send them the "Update to Your Interview" email\n\n` +
      `This action is immediate and cannot be undone.`
    )) return;

    setConvertingId(conf.conferenceId);
    setSingleResult(null);
    try {
      const adminName = localStorage.getItem("sales_member_name") || sessionStorage.getItem("sales_member_name") || "admin";
      const res = await base44.functions.invoke("convertScheduledInterviewToAsync", {
        conferenceId: conf.conferenceId,
        adminName,
        sendEmail: true,
        dryRun: false,
      });
      setSingleResult({ conferenceId: conf.conferenceId, ...res?.data ?? res });
      fetchEligible();
    } catch (err) {
      setSingleResult({ conferenceId: conf.conferenceId, status: "error", reason: err.message });
    } finally {
      setConvertingId(null);
    }
  };

  const formatScheduledTime = (date, time) => {
    if (!date || !time) return "—";
    return new Date(`${date}T${time}:00`).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1A1A1A] flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-[#B8956A]" />
              Scheduled Interview Migration
            </h2>
            <p className="text-sm text-[#1A1A1A]/60 mt-1">
              Convert currently scheduled first-round interviews to the new asynchronous format.
              Candidates choose between Conversational (Ashley) or Self-Guided Video.
            </p>
          </div>
          <button
            onClick={fetchEligible}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-sm text-[#1A1A1A]/70 hover:bg-[#FFFBF5] transition-colors shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-[#FFFBF5] rounded-lg p-3 border border-[#B8956A]/15">
              <p className="text-xs text-[#1A1A1A]/50 font-medium uppercase">Total Scheduled</p>
              <p className="text-xl font-bold text-[#1A1A1A] mt-1">{summary.totalScheduled}</p>
            </div>
            <div className="bg-[#FFFBF5] rounded-lg p-3 border border-[#B8956A]/15">
              <p className="text-xs text-[#1A1A1A]/50 font-medium uppercase">Eligible</p>
              <p className="text-xl font-bold text-[#B8956A] mt-1">{summary.eligibleCount}</p>
            </div>
            <div className="bg-[#FFFBF5] rounded-lg p-3 border-[#B8956A]/15">
              <p className="text-xs text-[#1A1A1A]/50 font-medium uppercase">Already Converted</p>
              <p className="text-xl font-bold text-[#1A1A1A]/40 mt-1">{summary.alreadyConvertedCount}</p>
            </div>
          </div>
        )}
      </div>

      {/* Authorized batch confirmation */}
      {authorizedBatch && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900">Batch authorized for {SCHEDULED_EXECUTION_TIME}</p>
            <p className="text-sm text-green-700 mt-1">
              {authorizedBatch.total_count} candidate(s) approved for conversion. The conversion will execute automatically at the scheduled time.
              Each candidate will receive a 48-hour async interview window starting from activation.
            </p>
            <p className="text-xs text-green-600 mt-2 font-mono">Batch ID: {authorizedBatch.id}</p>
          </div>
        </div>
      )}

      {/* Eligible interviews */}
      {eligible.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#B8956A]/15 p-8 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-[#B8956A]" />
          <p className="text-sm font-medium text-[#1A1A1A]">No eligible scheduled first-round interviews</p>
          <p className="text-xs text-[#1A1A1A]/50 mt-1">
            All scheduled interviews are either already converted, completed, or second-round.
          </p>
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          <div className="bg-[#1A1A1A] rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#FFFBF5]">
                {selectedCount} of {eligible.length} eligible candidates selected
              </p>
              <p className="text-xs text-[#FFFBF5]/50 mt-0.5">
                Uncheck candidates to exclude them from the bulk conversion
              </p>
            </div>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Shield className="w-4 h-4" />
              Authorize Bulk Conversion
            </button>
          </div>

          {/* Eligible list */}
          <div className="space-y-2">
            {eligible.map((item) => {
              const excluded = excludedIds.has(item.conferenceId);
              return (
                <div
                  key={item.conferenceId}
                  className={`bg-white rounded-xl border p-4 transition-all ${
                    excluded ? "border-[#B8956A]/10 opacity-50" : "border-[#B8956A]/20"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleExclude(item.conferenceId)}
                      className="w-5 h-5 rounded mt-1 shrink-0"
                      style={{ accentColor: "#B8956A" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[#1A1A1A] truncate">{item.candidateName}</p>
                          <p className="text-xs text-[#1A1A1A]/50 truncate">{item.candidateEmail}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#1A1A1A]/60">
                            <span className="flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" />
                              {formatScheduledTime(item.scheduledDate, item.scheduledTime)}
                            </span>
                            <span className="flex items-center gap-1">
                              {item.interviewMode === "ai" ? <Brain className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                              {item.interviewMode === "ai" ? "AI" : "Human"}
                            </span>
                            {item.appStatus && (
                              <span className="px-2 py-0.5 rounded-full bg-[#FFFBF5] text-[#1A1A1A]/60">
                                {item.appStatus}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleSingleConvert(item)}
                          disabled={convertingId === item.conferenceId}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#B8956A]/30 text-xs font-medium text-[#1A1A1A]/70 hover:bg-[#FFFBF5] transition-colors shrink-0 disabled:opacity-50"
                        >
                          {convertingId === item.conferenceId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ArrowRight className="w-3 h-3" />
                          )}
                          Convert Now
                        </button>
                      </div>

                      {singleResult?.conferenceId === item.conferenceId && (
                        <div className={`mt-2 p-2 rounded-lg text-xs ${
                          singleResult.status === "converted" ? "bg-green-50 text-green-700" :
                          singleResult.status === "already_converted" ? "bg-amber-50 text-amber-700" :
                          "bg-red-50 text-red-700"
                        }`}>
                          {singleResult.status === "converted" && (
                            <>✓ Converted — async session created, expires {new Date(singleResult.expiresAt).toLocaleString("en-US", { timeZone: "America/New_York" })}. Email {singleResult.emailSent ? "sent" : "not sent"}.</>
                          )}
                          {singleResult.status === "already_converted" && <>Already converted — no duplicate created.</>}
                          {singleResult.status === "error" && <>Error: {singleResult.reason}</>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Ineligible / excluded interviews */}
      {ineligible.length > 0 && (
        <details className="bg-white rounded-xl border border-[#B8956A]/15">
          <summary className="p-4 cursor-pointer text-sm font-medium text-[#1A1A1A]/70 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {ineligible.length} excluded interview(s) — click to view
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {ineligible.map((item) => (
              <div key={item.conferenceId} className="flex items-center justify-between p-3 bg-[#FFFBF5] rounded-lg">
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]/70">{item.candidateName}</p>
                  <p className="text-xs text-[#1A1A1A]/40">{formatScheduledTime(item.scheduledDate, item.scheduledTime)}</p>
                </div>
                <span className="text-xs text-[#1A1A1A]/50">
                  {item.alreadyConverted ? "✓ Already converted" : item.reason}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-[#B8956A]" />
              <h3 className="text-lg font-semibold text-[#1A1A1A]">Authorize Bulk Conversion</h3>
            </div>

            <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-900">
                You are about to convert <strong>{selectedCount}</strong> scheduled first-round interview(s) to the new asynchronous interview format.
                Candidates will no longer need to attend their scheduled time and will receive <strong>48 hours</strong> from activation to complete their interview.
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold text-[#1A1A1A]/60 uppercase mb-2">Scheduled Execution</p>
              <p className="text-sm text-[#1A1A1A] flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#B8956A]" />
                {SCHEDULED_EXECUTION_TIME}
              </p>
              <p className="text-xs text-[#1A1A1A]/50 mt-1">
                Each candidate's 48-hour window starts at activation. Expected deadline: September 3, 2026 at 7:30 AM ET.
              </p>
            </div>

            <div className="mb-4">
              <p className="text-xs font-semibold text-[#1A1A1A]/60 uppercase mb-2">Affected Candidates ({selectedCount})</p>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-[#B8956A]/15 rounded-lg p-2">
                {selectedInterviews.map((item) => (
                  <div key={item.conferenceId} className="flex items-center justify-between text-sm py-1.5 px-2">
                    <span className="text-[#1A1A1A]">{item.candidateName}</span>
                    <span className="text-xs text-[#1A1A1A]/50">{formatScheduledTime(item.scheduledDate, item.scheduledTime)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#FFFBF5] rounded-lg p-3 mb-4">
              <p className="text-xs text-[#1A1A1A]/60 flex items-start gap-2">
                <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  At the scheduled time, each candidate will receive the "Update to Your Arriv Estate Media Interview" email.
                  Their old scheduled appointment, calendar invite, and 30-minute reminder will be cancelled.
                  No emails are sent now.
                </span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={authorizing}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#B8956A]/30 text-sm font-medium text-[#1A1A1A]/70 hover:bg-[#FFFBF5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAuthorizeBulk}
                disabled={authorizing || selectedCount === 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {authorizing ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Authorizing...</span>
                ) : (
                  `Authorize for ${SCHEDULED_EXECUTION_TIME}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}