import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Phone, Building2, Clock, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import moment from "moment";

export default function ReferenceCheckModal({ applicationId, applicantName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    base44.entities.ApplicantReference.filter({ application_id: applicationId })
      .then((rows) => {
        if (cancelled) return;
        // Most recent first
        rows.sort((a, b) => new Date(b.request_sent_at || 0) - new Date(a.request_sent_at || 0));
        setRecord(rows[0] || null);
      })
      .catch((e) => !cancelled && setError(e?.message || "Could not load references."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [applicationId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1A1A1A] text-white px-5 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h3 className="font-semibold">References — {applicantName}</h3>
            <p className="text-xs text-white/60">Sales Growth Advisor candidate</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-[#B8956A] animate-spin" /></div>}

          {!loading && error && (
            <div className="flex gap-2 items-start p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && !record && (
            <p className="text-sm text-[#1A1A1A]/60 text-center py-8">No reference request has been sent yet. Click "Reference Check" to email this candidate.</p>
          )}

          {!loading && !error && record && (
            <>
              <div className="flex items-center gap-2 mb-4">
                {record.status === "submitted" ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    <Clock className="w-3.5 h-3.5" /> Requested — awaiting submission
                  </span>
                )}
                <span className="text-xs text-[#1A1A1A]/50">
                  Sent {record.request_sent_at ? moment(record.request_sent_at).format("MMM D, YYYY [at] h:mm A") : "—"}
                </span>
              </div>

              {record.status !== "submitted" && (
                <p className="text-sm text-[#1A1A1A]/60 mb-4">
                  The candidate hasn't submitted their references yet. Deadline: <strong>{record.deadline ? moment(record.deadline).format("MMM D, YYYY") : "—"}</strong>.
                </p>
              )}

              {record.status === "submitted" && (record.references || []).length > 0 && (
                <div className="space-y-3">
                  {record.references.map((r, i) => (
                    <div key={i} className="border border-[#B8956A]/20 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-[#1A1A1A]">{r.name}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#B8956A]/10 text-[#B8956A] font-medium">
                          {r.reference_type === "professional" ? "Professional" : "Character"}
                        </span>
                      </div>
                      <div className="text-sm text-[#1A1A1A]/70 space-y-1">
                        {r.email && <div className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#B8956A]" /> <a href={`mailto:${r.email}`} className="text-[#B8956A] underline">{r.email}</a></div>}
                        {r.phone && <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#B8956A]" /> {r.phone}</div>}
                        {r.relationship && <div><span className="text-[#1A1A1A]/50">Relationship:</span> {r.relationship}</div>}
                        {r.company && <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-[#B8956A]" /> {r.company}</div>}
                        {r.years_known && <div><span className="text-[#1A1A1A]/50">Known for:</span> {r.years_known}</div>}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-[#1A1A1A]/50 pt-1">
                    Submitted {record.submitted_at ? moment(record.submitted_at).format("MMM D, YYYY [at] h:mm A") : "—"} · Reference emails sent automatically from careers@arrivestatemedia.com
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}