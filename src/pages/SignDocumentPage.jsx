import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, CheckCircle2, XCircle, AlertCircle, ShieldCheck, PenTool } from "lucide-react";
import SignaturePad from "@/components/sign/SignaturePad";

// Parse editor HTML into segments: HTML chunks and field placeholders
function parseEditorSegments(html) {
  if (!html) return [];
  const re = /\{\{(sig|date|name|text|initial):([^}]+)\}\}/g;
  const segments = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "html", content: html.substring(lastIndex, m.index) });
    }
    segments.push({
      type: "field",
      fieldType: m[1],
      label: m[2].trim(),
      fieldId: m[2].trim().replace(/\s+/g, "_").toLowerCase(),
    });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < html.length) {
    segments.push({ type: "html", content: html.substring(lastIndex) });
  }
  return segments;
}

const FIELD_BORDER_COLORS = {
  signature: "border-[#B8956A]",
  date: "border-[#B8956A]",
  name: "border-green-400",
  text: "border-slate-400",
  initial: "border-purple-400",
};

export default function SignDocumentPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docData, setDocData] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // "signed" | "declined" | null
  const [submitError, setSubmitError] = useState("");
  const [waiting, setWaiting] = useState(null);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getSignRequest", { token });
      const data = res?.data ?? res;
      if (data?.waiting) {
        setWaiting(data);
        setDocData(null);
        return;
      }
      if (data?.error) {
        setError(data.error);
        setDocData(null);
        // If already signed, show that state
        if (data.status === "signed") setSubmitted("signed");
        else if (data.status === "declined") setSubmitted("declined");
        else if (data.status === "voided") setSubmitted("voided");
        return;
      }
      setDocData(data);
      // Auto-fill date fields with today's date
      const fields = data.signature_fields || [];
      const autoValues = {};
      for (const f of fields) {
        if (f.type === "date") {
          autoValues[f.field_id] = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        }
      }
      // Also auto-fill date placeholders in editor mode
      if (data.source_type === "editor" && data.merged_body_html) {
        const segments = parseEditorSegments(data.merged_body_html);
        for (const seg of segments) {
          if (seg.type === "field" && seg.fieldType === "date") {
            autoValues[seg.fieldId] = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
          }
        }
      }
      setFieldValues(autoValues);
    } catch (e) {
      setError(e.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  const setFieldValue = (fieldId, value) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (action = "sign") => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await base44.functions.invoke("submitSignature", { token, field_values: fieldValues, action });
      const data = res?.data ?? res;
      if (data?.error) {
        setSubmitError(data.error);
        return;
      }
      setSubmitted(action === "decline" ? "declined" : "signed");
    } catch (e) {
      setSubmitError(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#B8956A] mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading document...</p>
        </div>
      </div>
    );
  }

  // Already submitted states
  if (submitted === "signed" || (error && docData === null && submitted === "signed")) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">Document Signed</h1>
          <p className="text-sm text-slate-500 mb-4">Your signature has been recorded. A confirmation email is on its way.</p>
          <p className="text-xs text-slate-400">You can safely close this page.</p>
        </div>
      </div>
    );
  }

  if (submitted === "declined") {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">Document Declined</h1>
          <p className="text-sm text-slate-500 mb-4">You have declined to sign this document. The sender has been notified.</p>
          <p className="text-xs text-slate-400">You can safely close this page.</p>
        </div>
      </div>
    );
  }

  if (submitted === "voided" || (error && error.includes("voided"))) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-500" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">Document Voided</h1>
          <p className="text-sm text-slate-500">This document is no longer available for signature.</p>
        </div>
      </div>
    );
  }

  // Waiting state (multi-signer succession)
  if (waiting) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
          <Loader2 className="w-12 h-12 text-[#B8956A] mx-auto mb-4 animate-spin" />
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">Waiting for Previous Signer</h1>
          <p className="text-sm text-slate-500 mb-2"><strong>{waiting.document_title}</strong></p>
          <p className="text-sm text-slate-500">You are signer {waiting.your_order} of {waiting.sign_group_total}. {waiting.waiting_for} must sign before you can sign this document.</p>
          <p className="text-xs text-slate-400 mt-4 mb-4">Check back once they've signed.</p>
          <Button variant="outline" onClick={() => loadDoc()} className="border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/5">Check Again</Button>
        </div>
      </div>
    );
  }

  // Error state (invalid/expired token)
  if (error && !docData) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#B8956A]/25 p-8 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-2">Unable to Open Document</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!docData) return null;

  const segments = docData.source_type === "editor" ? parseEditorSegments(docData.merged_body_html) : [];
  const uploadFields = docData.source_type === "upload" ? (docData.signature_fields || []) : [];

  // Check if all required fields are filled
  const allFields = docData.source_type === "editor"
    ? segments.filter(s => s.type === "field")
    : uploadFields;
  const requiredFields = allFields.filter(f => f.required !== false && !f.static_value);
  const allRequiredFilled = requiredFields.every(f => (fieldValues[f.field_id] || fieldValues[f.fieldId] || "").trim());

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <div className="bg-[#1A1A1A] py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png"
            alt="Arriv Estate Media"
            className="h-10 mx-auto"
          />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Document info */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A1A1A] mb-1">{docData.document_title}</h1>
          <p className="text-sm text-slate-500">
            {docData.candidate_name ? `For: ${docData.candidate_name}` : ""}
          </p>
        </div>

        {/* Security notice */}
        <div className="mb-6 p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600">
            Your electronic signature is legally binding. Your IP address, timestamp, and signing method will be recorded in the audit trail.
          </p>
        </div>

        {/* Document body */}
        {docData.source_type === "editor" ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
            <div className="prose prose-sm max-w-none text-[#1A1A1A]">
              {segments.map((seg, i) => {
                if (seg.type === "html") {
                  return <div key={i} dangerouslySetInnerHTML={{ __html: seg.content }} />;
                }
                // Field segment
                const value = fieldValues[seg.fieldId] || "";
                const borderColor = FIELD_BORDER_COLORS[seg.fieldType] || "border-slate-400";
                return (
                  <span key={i} className="inline-block align-middle mx-1 my-1">
                    {seg.fieldType === "signature" || seg.fieldType === "initial" ? (
                      <span className={`inline-block min-w-[200px] border-2 border-dashed ${borderColor} rounded-lg p-2 bg-[#FFFBF5]`}>
                        <div className="text-xs text-slate-400 mb-1">{seg.label} *</div>
                        {value && value.startsWith("data:image/") ? (
                          <img src={value} alt="Signature" className="h-12 max-w-[250px]" />
                        ) : value ? (
                          <span className="text-lg font-serif italic text-[#1A1A1A]">{value}</span>
                        ) : (
                          <span className="text-xs text-slate-400">[Sign below]</span>
                        )}
                      </span>
                    ) : seg.fieldType === "date" ? (
                      <span className={`inline-block px-3 py-1 border-2 ${borderColor} rounded text-sm text-[#1A1A1A] bg-[#FFFBF5]`}>
                        {value || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setFieldValue(seg.fieldId, e.target.value)}
                        placeholder={seg.label}
                        className={`inline-block min-w-[150px] px-2 py-1 border-2 ${borderColor} rounded text-sm bg-[#FFFBF5] focus:outline-none focus:ring-1 focus:ring-[#B8956A]`}
                      />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          /* Upload mode: PDF with overlaid fields */
          <div>
            {docData.pdf_url ? (
              <div className="relative w-full border-2 border-slate-200 rounded-lg overflow-hidden bg-white" style={{ minHeight: "800px" }}>
                <iframe
                  src={docData.pdf_url}
                  className="absolute inset-0 w-full h-full"
                  style={{ minHeight: "800px" }}
                  title="Document PDF"
                />
                {uploadFields.map((f, idx) => {
                  const isStatic = !!f.static_value;
                  const value = isStatic ? f.static_value : (fieldValues[f.field_id] || "");
                  const borderColor = isStatic ? "border-slate-300" : (FIELD_BORDER_COLORS[f.type] || "border-slate-400");
                  return (
                    <div
                      key={f.field_id || idx}
                      className={`absolute border-2 ${borderColor} rounded-md ${isStatic ? "bg-slate-50" : "bg-white/90"} shadow-sm`}
                      style={{
                        left: `${f.x}%`,
                        top: `${f.y}%`,
                        width: `${f.width}%`,
                        minHeight: "40px",
                      }}
                    >
                      <div className="text-xs text-slate-400 px-1.5 pt-0.5">{f.label}{f.required !== false && !isStatic && " *"}</div>
                      {isStatic ? (
                        <div className="px-1.5 pb-1.5 text-sm text-slate-600">{value}</div>
                      ) : f.type === "signature" || f.type === "initial" ? (
                        <div className="px-1.5 pb-1.5">
                          {value && value.startsWith("data:image/") ? (
                            <img src={value} alt="Signature" className="h-10 max-w-full" />
                          ) : value ? (
                            <span className="text-base font-serif italic text-[#1A1A1A]">{value}</span>
                          ) : (
                            <span className="text-xs text-slate-400">[Sign below]</span>
                          )}
                        </div>
                      ) : f.type === "date" ? (
                        <div className="px-1.5 pb-1.5 text-sm text-[#1A1A1A]">
                          {value || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setFieldValue(f.field_id, e.target.value)}
                          placeholder={f.label}
                          className="w-full px-1.5 pb-1.5 text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-[#B8956A] rounded"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Unable to load PDF preview. You can still sign below.</p>
              </div>
            )}
          </div>
        )}

        {/* Signature fields section */}
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-1.5">
            <PenTool className="w-4 h-4 text-[#B8956A]" /> Complete Your Signature
          </h3>

          {(docData.source_type === "editor" ? segments.filter(s => s.type === "field") : uploadFields.filter(f => !f.static_value)).length === 0 ? (
            /* No fields defined — show a default signature pad */
            <div>
              <Label className="text-sm text-slate-600 mb-1 block">Your Full Name (Signature)</Label>
              <SignaturePad
                value={fieldValues["signature"] || ""}
                onChange={(v) => setFieldValue("signature", v)}
                placeholder="Type your full name"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {(docData.source_type === "editor"
                ? segments.filter(s => s.type === "field")
                : uploadFields.filter(f => !f.static_value)
              ).map((f, idx) => {
                const fieldId = f.field_id || f.fieldId;
                const value = fieldValues[fieldId] || "";
                if (f.fieldType === "date" || f.type === "date") return null; // auto-filled
                return (
                  <div key={fieldId || idx}>
                    <label className="text-sm text-slate-600 mb-1 block">
                      {f.label} {f.required !== false && <span className="text-red-500">*</span>}
                    </label>
                    {(f.fieldType === "signature" || f.fieldType === "initial" || f.type === "signature" || f.type === "initial") ? (
                      <SignaturePad
                        value={value}
                        onChange={(v) => setFieldValue(fieldId, v)}
                        placeholder={`Type your ${f.fieldType === "initial" || f.type === "initial" ? "initials" : "full name"}`}
                      />
                    ) : (
                      <Input
                        type="text"
                        value={value}
                        onChange={(e) => setFieldValue(fieldId, e.target.value)}
                        placeholder={f.label}
                        className="max-w-md"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {submitError && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-600">{submitError}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => handleSubmit("sign")}
            disabled={submitting}
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white h-12 text-base"
          >
            {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Signing...</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Sign Document</>}
          </Button>
          <Button
            onClick={() => {
              if (confirm("Are you sure you want to decline to sign this document?")) handleSubmit("decline");
            }}
            disabled={submitting}
            variant="outline"
            className="sm:w-32 h-12 text-base border-red-300 text-red-600 hover:bg-red-50"
          >
            Decline
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          By clicking "Sign Document", you agree to sign this document electronically. Your signature is legally binding.
        </p>
      </div>
    </div>
  );
}