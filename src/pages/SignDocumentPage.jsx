import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, CheckCircle2, XCircle, AlertCircle, ShieldCheck } from "lucide-react";
import SignaturePad from "@/components/sign/SignaturePad";
import PdfSignPreview from "@/components/sign/PdfSignPreview";
import EditorDocumentBody from "@/components/sign/EditorDocumentBody";
import SignStatusScreen from "@/components/sign/SignStatusScreen";
import { parseInlineFields } from "@/lib/signInlineFields";

const LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png";
const today = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const errorMessage = (e) =>
  e?.response?.data?.error || e?.data?.error || e?.response?.data?.message || e?.message || "Something went wrong";
const fieldsOf = (doc) =>
  !doc ? [] : doc.source_type === "editor" ? parseInlineFields(doc.merged_body_html).fields : (doc.signature_fields || []);

export default function SignDocumentPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [doc, setDoc] = useState(null);
  const [values, setValues] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // signed | declined | voided
  const [submitError, setSubmitError] = useState("");
  const [waiting, setWaiting] = useState(null);

  const loadDoc = useCallback(async () => {
    setLoading(true);
    setError("");
    setWaiting(null);
    try {
      const res = await base44.functions.invoke("getSignRequest", { token });
      const data = res?.data ?? res;
      if (data?.waiting) { setWaiting(data); return; }
      if (data?.error) {
        if (["signed", "declined", "voided"].includes(data.status)) setSubmitted(data.status);
        else setError(data.error);
        return;
      }
      setDoc(data);
      const fields = fieldsOf(data);
      const initial = {};
      for (const f of fields) {
        if (f.static_value) initial[f.field_id] = f.static_value;
        else if (f.type === "date") initial[f.field_id] = today();
        else if ((f.type === "name" || f.type === "signature") && data.candidate_name) initial[f.field_id] = data.candidate_name;
      }
      if (!fields.some((f) => !f.static_value)) initial.signature = data.candidate_name || "";
      setValues(initial);
    } catch (e) {
      const status = e?.response?.data?.status;
      if (["signed", "declined", "voided"].includes(status)) setSubmitted(status);
      else setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  const fields = useMemo(() => fieldsOf(doc), [doc]);
  const fillable = fields.filter((f) => !f.static_value);
  const noFields = fillable.length === 0;
  const missingRequired = noFields
    ? (String(values.signature || "").trim() ? [] : [{ field_id: "signature", label: "Signature" }])
    : fillable.filter((f) => f.required !== false && !String(values[f.field_id] || "").trim());
  const missingIds = useMemo(
    () => new Set(attempted ? missingRequired.map((f) => f.field_id) : []),
    [attempted, missingRequired.map((f) => f.field_id).join("|")] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const setValue = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));

  const submit = async (action) => {
    setSubmitError("");
    if (action === "sign") {
      setAttempted(true);
      if (missingRequired.length) return setSubmitError(`Please complete: ${missingRequired.map((f) => f.label).join(", ")}`);
      if (!agreed) return setSubmitError("Please confirm that you agree to sign electronically.");
    }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("submitSignature", { token, field_values: values, action });
      const data = res?.data ?? res;
      if (data?.error) { setSubmitError(data.error); return; }
      setSubmitted(action === "decline" ? "declined" : "signed");
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFBF5] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }
  if (submitted === "signed") {
    return (
      <SignStatusScreen icon={CheckCircle2} title="Document Signed">
        Your signature has been recorded. A confirmation email with your signed copy is on its way. You can safely close this page.
      </SignStatusScreen>
    );
  }
  if (submitted === "declined") {
    return (
      <SignStatusScreen icon={XCircle} iconClass="text-red-500" iconBg="bg-red-50" title="Document Declined">
        You have declined to sign this document. You can safely close this page.
      </SignStatusScreen>
    );
  }
  if (submitted === "voided") {
    return (
      <SignStatusScreen icon={AlertCircle} iconClass="text-slate-500" iconBg="bg-slate-100" title="Document Voided">
        This document is no longer available for signature.
      </SignStatusScreen>
    );
  }
  if (waiting) {
    return (
      <SignStatusScreen icon={Loader2} iconClass="text-[#B8956A] animate-spin" title="Waiting for Previous Signer">
        <p className="mb-2"><strong>{waiting.document_title}</strong></p>
        <p>You are signer {waiting.your_order} of {waiting.sign_group_total}. {waiting.waiting_for} must sign before you can sign this document.</p>
        <Button variant="outline" onClick={loadDoc} className="mt-5 border-[#B8956A]/30 text-[#B8956A] hover:bg-[#B8956A]/5">Check Again</Button>
      </SignStatusScreen>
    );
  }
  if (error || !doc) {
    return (
      <SignStatusScreen icon={AlertCircle} iconClass="text-amber-600" iconBg="bg-amber-50" title="Unable to Open Document">
        {error || "This sign link is not valid."}
      </SignStatusScreen>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF5] pb-40" style={{ colorScheme: "light" }}>
      <div className="bg-[#1A1A1A] py-5 px-4">
        <img src={LOGO} alt="Arriv Estate Media" className="h-9 mx-auto" />
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
        <h1 className="text-2xl font-bold text-[#1A1A1A] mb-1">{doc.document_title}</h1>
        {doc.candidate_name && <p className="text-sm text-slate-500 mb-4">For: {doc.candidate_name}</p>}

        <div className="mb-5 p-3 rounded-lg bg-[#B8956A]/10 border border-[#B8956A]/20 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#B8956A] mt-0.5 shrink-0" />
          <p className="text-xs text-slate-600">
            Tap each highlighted field to fill it in. Your electronic signature is legally binding — your IP address, timestamp, and signing method are recorded in the audit trail.
          </p>
        </div>

        {doc.source_type === "editor" ? (
          <EditorDocumentBody html={doc.merged_body_html} values={values} onChange={setValue} missingIds={missingIds} />
        ) : doc.pdf_url ? (
          <PdfSignPreview pdfUrl={doc.pdf_url} fields={fields} values={values} onChange={setValue} showMissing={attempted} />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Unable to load the document preview.</p>
          </div>
        )}

        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
          {noFields && (
            <div>
              <p className="text-sm font-medium text-[#1A1A1A] mb-1.5">Your Signature <span className="text-red-500">*</span></p>
              <div className={`h-28 border-2 border-dashed rounded-lg overflow-hidden ${missingIds.has("signature") ? "border-red-400" : "border-[#B8956A]/50"}`}>
                <SignaturePad value={values.signature || ""} onChange={(v) => setValue("signature", v)} />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
            <span className="text-sm text-slate-600">
              I agree to sign this document electronically and understand my electronic signature is legally binding.
            </span>
          </label>

          {submitError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{submitError}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => submit("sign")} disabled={submitting} className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white h-12 text-base">
              {submitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Submitting...</> : <><CheckCircle2 className="w-5 h-5 mr-2" /> Sign Document</>}
            </Button>
            <Button
              onClick={() => { if (window.confirm("Are you sure you want to decline to sign this document?")) submit("decline"); }}
              disabled={submitting}
              variant="outline"
              className="sm:w-32 h-12 text-base border-red-300 text-red-600 hover:bg-red-50"
            >
              Decline
            </Button>
          </div>
          {!noFields && (
            <p className="text-xs text-slate-400 text-center">
              {fillable.length - missingRequired.length} of {fillable.length} fields complete
            </p>
          )}
        </div>
      </div>
    </div>
  );
}