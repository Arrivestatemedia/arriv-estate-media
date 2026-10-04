import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, X, FileCheck, Trash2, PenTool, MousePointerClick, Eye, EyeOff } from "lucide-react";
import { convertDocxToPdfBlob } from "@/lib/docxToPdf";
import PdfFieldPlacer from "@/components/hireiq/PdfFieldPlacer";

const DOC_TYPES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "employment_agreement", label: "Employment Agreement" },
  { value: "nda", label: "NDA" },
  { value: "addendum", label: "Addendum" },
  { value: "w9", label: "W-9" },
  { value: "ica", label: "ICA" },
  { value: "custom", label: "Custom Document" },
];

// Default example templates per document type — pre-filled when creating new.
// Editable before saving so the user can tweak before creating.
const DEFAULT_TEMPLATES = {
  offer_letter: `<h1>Offer of Employment</h1>
<p>Hi {{candidate_name}},</p>
<p>Congratulations!</p>
<p>We're excited to offer you the position of {{job_title}} with {{company_name}}.</p>
<p>After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team. We're looking forward to having you help us grow {{company_name}} as we continue expanding across new markets.</p>
<h2>Your Offer</h2>
<p>As a {{job_title}}, you'll play an important role in introducing {{company_name}} to new clients and helping us build lasting relationships.</p>
<p><strong>Position:</strong> {{job_title}}<br><strong>Employment Type:</strong> Commission-Based W-2<br><strong>Compensation:</strong> Commission-based, plus a $500 training bonus after successfully completing your first two weeks of training and meeting the program requirements.</p>
<h2>Next Steps</h2>
<p>Please review and respond to your offer within 7 days. If you need additional time or have any questions before making your decision, simply reply to your offer email — we're happy to help.</p>
<p>We're excited about the possibility of working together and can't wait to see the impact you'll make as part of the team.</p>
<p>Welcome to {{company_name}}!</p>
<p>Best regards,<br>{{signature_name}}<br>{{signature_title}}<br>{{company_name}}</p>
<hr>
<p><em>Sign below to accept this offer:</em></p>
<p>Candidate Signature: {{sig:Signature}} &nbsp; Date: {{date:Date}}</p>`,
  employment_agreement: `<h1>Employment Agreement</h1>
<p>This Employment Agreement ("Agreement") is entered into between {{company_name}} ("Company") and {{candidate_name}} ("Employee") as of {{today_date}}.</p>
<h2>1. Position</h2>
<p>The Company employs the Employee as {{job_title}}.</p>
<h2>2. Duties</h2>
<p>The Employee shall perform the duties customary to the {{job_title}} role and such other duties as may be assigned.</p>
<h2>3. Compensation</h2>
<p>The Employee's compensation shall be as described in the offer letter accompanying this Agreement.</p>
<h2>4. Signatures</h2>
<p>Company: {{sig:Company Signature}} &nbsp; Date: {{date:Date}}</p>
<p>Employee: {{sig:Signature}} &nbsp; Date: {{date:Date}}</p>`,
  nda: `<h1>Non-Disclosure Agreement</h1>
<p>This Non-Disclosure Agreement is entered into between {{company_name}} and {{candidate_name}} on {{today_date}}.</p>
<h2>Confidential Information</h2>
<p>The parties agree to keep confidential all proprietary information disclosed during the course of their relationship.</p>
<h2>Signatures</h2>
<p>{{sig:Signature}} &nbsp; {{date:Date}}</p>`,
  addendum: `<h1>Addendum</h1>
<p>This Addendum is entered into between {{company_name}} and {{candidate_name}} on {{today_date}}.</p>
<p>Terms of the addendum go here.</p>
<p>{{sig:Signature}} &nbsp; {{date:Date}}</p>`,
  w9: `<h1>W-9 Tax Form</h1>
<p>Name: {{name:Full Name}}</p>
<p>Business Name: {{text:Business Name}}</p>
<p>Date: {{date:Date}}</p>
<p>Signature: {{sig:Signature}}</p>`,
  ica: `<h1>Independent Contractor Agreement</h1>
<p>This Agreement is between {{company_name}} and {{candidate_name}}, effective {{today_date}}.</p>
<p>The Contractor shall provide services as {{job_title}}.</p>
<p>Contractor Signature: {{sig:Signature}} &nbsp; Date: {{date:Date}}</p>
<p>Company Signature: {{sig:Company Signature}} &nbsp; Date: {{date:Date}}</p>`,
  custom: `<h1>Document Title</h1>
<p>Write your document here. Use merge fields like {{candidate_name}} and signature fields like {{sig:Signature}}.</p>
<p>{{sig:Signature}} &nbsp; {{date:Date}}</p>`,
};

// Preview helper — substitutes merge fields with sample data and renders
// signature/date/name fields as styled dashed-underline placeholders.
const previewSubstitute = (html) => {
  if (!html) return "";
  const fieldStyle = "border-bottom:1.5px dashed #B8956A;min-width:120px;display:inline-block;padding:0 4px;color:#B8956A;font-weight:600;";
  const samples = {
    candidate_name: "Jane Smith",
    candidate_email: "jane@example.com",
    job_title: "Sales Growth Advisor",
    company_name: "Arriv Estate Media",
    signature_name: "Bradley Arriv",
    signature_title: "Hiring Manager",
    today_date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  };
  let out = html;
  Object.entries(samples).forEach(([k, v]) => {
    out = out.split(`{{${k}}}`).join(v);
  });
  out = out.replace(/\{\{(sig|date|name|text|initial):([^}]+)\}\}/g, (_m, _type, label) =>
    `<span style="${fieldStyle}">${label}</span>`
  );
  return out;
};

const MERGE_HINTS = [
  "{{candidate_name}}", "{{candidate_email}}", "{{job_title}}",
  "{{company_name}}", "{{signature_name}}", "{{signature_title}}", "{{today_date}}",
];

const FIELD_TYPES = [
  { type: "signature", label: "Signature", placeholder: "Signature" },
  { type: "date", label: "Date", placeholder: "Date" },
  { type: "name", label: "Name", placeholder: "Full Name" },
  { type: "text", label: "Text", placeholder: "Custom Text" },
  { type: "initial", label: "Initials", placeholder: "Initials" },
];

const FIELD_COLORS = {
  signature: "border-amber-400 bg-amber-50/80",
  date: "border-[#B8956A] bg-[#B8956A]/10",
  name: "border-green-400 bg-green-50/80",
  text: "border-slate-400 bg-slate-50/80",
  initial: "border-purple-400 bg-purple-50/80",
};

export default function SignDocumentEditorModal({ onClose, onSaved, existing, salesMemberId }) {
  const [title, setTitle] = useState(existing?.title || "");
  const [docType, setDocType] = useState(existing?.document_type || "offer_letter");
  const [sourceType, setSourceType] = useState(existing?.source_type || "editor");
  const [bodyHtml, setBodyHtml] = useState(existing?.body_html || DEFAULT_TEMPLATES[existing?.document_type] || DEFAULT_TEMPLATES.offer_letter);
  const [fileUri, setFileUri] = useState(existing?.body_ref || "");
  const [fileName, setFileName] = useState("");
  const [pdfSignedUrl, setPdfSignedUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pdfFields, setPdfFields] = useState(existing?.signature_fields || []);
  const [pendingFieldType, setPendingFieldType] = useState(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef(null);

  // Create a signed URL for existing documents with a body_ref
  useEffect(() => {
    if (existing?.body_ref && !pdfSignedUrl) {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: existing.body_ref, expires_in: 3600 })
        .then((res) => {
          const data = res?.data || res;
          if (data?.signed_url) setPdfSignedUrl(data.signed_url);
        })
        .catch(() => {});
    }
  }, [existing?.body_ref]);

  const handleUpload = async (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isDocx = file.name.toLowerCase().endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isPdf && !isDocx) {
      setError("Please upload a PDF or .docx file. .docx files are converted to PDF automatically.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      let pdfFile = file;
      let displayName = file.name;

      if (isDocx) {
        const pdfBlob = await convertDocxToPdfBlob(file);
        displayName = file.name.replace(/\.docx$/i, "") + ".pdf";
        pdfFile = new File([pdfBlob], displayName, { type: "application/pdf" });
      }

      const res = await base44.integrations.Core.UploadPrivateFile({ file: pdfFile });
      const data = res?.data || res;
      const uri = data?.file_uri;
      if (!uri) throw new Error("Upload failed — no file URI returned");
      setFileUri(uri);
      setFileName(displayName);
      // Create a signed URL so the iframe can actually display the private PDF
      const signedRes = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 3600 });
      const signedData = signedRes?.data || signedRes;
      setPdfSignedUrl(signedData?.signed_url || "");
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const insertAtCursor = (text) => {
    const ta = textareaRef.current;
    if (!ta) { setBodyHtml((prev) => (prev || "") + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = bodyHtml.substring(0, start);
    const after = bodyHtml.substring(end);
    const newVal = before + text + after;
    setBodyHtml(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const insertSigField = (type, label) => {
    const cleanLabel = label || FIELD_TYPES.find(f => f.type === type)?.placeholder || "Field";
    insertAtCursor(`{{${type === "signature" ? "sig" : type}:${cleanLabel}}}`);
  };

  const handleDocTypeChange = (val) => {
    setDocType(val);
    // Only auto-fill the default template when creating a NEW document (not editing existing)
    // AND the body is empty or still matches a default template.
    if (!existing) {
      const isDefault = Object.values(DEFAULT_TEMPLATES).includes(bodyHtml);
      if (isDefault) setBodyHtml(DEFAULT_TEMPLATES[val] || DEFAULT_TEMPLATES.custom);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return setError("Title is required");
    if (sourceType === "upload" && !fileUri) return setError("Please upload a PDF");
    if (sourceType === "editor" && !bodyHtml.trim()) return setError("Please write the document body");
    setSaving(true);
    setError("");
    try {
      const payload = {
        action: existing ? "update" : "create",
        sales_member_id: salesMemberId,
        title: title.trim(),
        document_type: docType,
        source_type: sourceType,
        body_html: sourceType === "editor" ? bodyHtml : undefined,
        body_ref: sourceType === "upload" ? fileUri : undefined,
        signature_fields: sourceType === "upload" ? pdfFields : undefined,
      };
      if (existing) payload.id = existing.id;
      const res = await base44.functions.invoke("manageSignDocuments", payload);
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);
      onSaved?.(data?.document);
    } catch (e) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            {existing ? "Edit Document" : "New Document"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <Label className="text-sm font-medium text-slate-700">Document Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sales Growth Advisor Offer Letter"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-slate-700">Document Type</Label>
            <select
              value={docType}
              onChange={(e) => handleDocTypeChange(e.target.value)}
              className="mt-1.5 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-sm font-medium text-slate-700">Source</Label>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => setSourceType("editor")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  sourceType === "editor"
                    ? "bg-[#B8956A] text-white border-[#B8956A]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-[#B8956A]/40"
                }`}
              >
                <FileText className="w-4 h-4" /> Rich-Text Editor
              </button>
              <button
                onClick={() => setSourceType("upload")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                  sourceType === "upload"
                    ? "bg-[#B8956A] text-white border-[#B8956A]"
                    : "bg-white text-slate-600 border-slate-200 hover:border-[#B8956A]/40"
                }`}
              >
                <Upload className="w-4 h-4" /> Upload PDF / DOCX
              </button>
            </div>
          </div>

          {sourceType === "editor" ? (
            <>
              <div>
                <Label className="text-sm font-medium text-slate-700">Merge Fields</Label>
                <p className="text-xs text-slate-500 mt-0.5 mb-2">Click to insert at cursor — auto-fills with candidate data when sent.</p>
                <div className="flex flex-wrap gap-1.5">
                  {MERGE_HINTS.map((f) => (
                    <button
                      key={f}
                      onClick={() => insertAtCursor(f)}
                      className="text-xs px-2 py-1 rounded-md bg-[#B8956A]/10 text-[#B8956A] hover:bg-[#B8956A]/20 font-mono"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5" /> Signature Fields
                </Label>
                <p className="text-xs text-slate-500 mt-0.5 mb-2">Place signature, date, and name fields exactly where you want them in the document.</p>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_TYPES.map((ft) => (
                    <button
                      key={ft.type}
                      onClick={() => insertSigField(ft.type, ft.placeholder)}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 font-medium flex items-center gap-1"
                    >
                      <PenTool className="w-3 h-3" /> {ft.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-slate-700">Document Body (HTML)</Label>
                  <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5 text-xs">
                    {showPreview ? <><EyeOff className="w-3.5 h-3.5" /> Edit Only</> : <><Eye className="w-3.5 h-3.5" /> Split Preview</>}
                  </Button>
                </div>
                {showPreview ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Editor</p>
                      <Textarea
                        ref={textareaRef}
                        value={bodyHtml}
                        onChange={(e) => setBodyHtml(e.target.value)}
                        placeholder="<h1>Offer of Employment</h1><p>Dear {{candidate_name}}, ...</p>"
                        className="min-h-[400px] font-mono text-sm"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Preview (sample data)</p>
                      <div
                        className="border rounded-lg p-4 bg-slate-50 min-h-[400px] prose prose-sm max-w-none text-slate-900 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: previewSubstitute(bodyHtml) }}
                      />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    ref={textareaRef}
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<h1>Offer of Employment</h1><p>Dear {{candidate_name}}, ...</p><p>Signed: {{sig:Signature}} on {{date:Date}}</p>"
                    className="min-h-[300px] font-mono text-sm"
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-sm font-medium text-slate-700">Upload PDF or DOCX</Label>
                <div className="mt-1.5 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center relative overflow-hidden">
                  {fileUri ? (
                    <div className="flex items-center justify-center gap-3 text-green-600">
                      <FileCheck className="w-8 h-8" />
                      <div className="text-left">
                        <p className="font-medium">{fileName || "PDF uploaded"}</p>
                        <p className="text-xs text-slate-400">Click to replace</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400">
                      <Upload className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">Click to upload a PDF or DOCX</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => handleUpload(e.target.files?.[0])}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {uploading && <p className="text-sm text-slate-500 mt-2 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</p>}
              </div>

              {fileUri && (
                <div>
                  <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5" /> Place Signature Fields on the Document
                  </Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">
                    Select a field type, then click on the PDF where you want it.
                  </p>

                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {FIELD_TYPES.map((ft) => (
                      <button
                        key={ft.type}
                        onClick={() => setPendingFieldType(pendingFieldType === ft.type ? null : ft.type)}
                        className={`text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1 border-2 transition-colors ${
                          pendingFieldType === ft.type
                            ? "bg-[#B8956A] text-white border-[#B8956A]"
                            : `bg-white text-slate-600 border-slate-200 hover:border-[#B8956A]/40`
                        }`}
                      >
                        {pendingFieldType === ft.type ? <MousePointerClick className="w-3 h-3" /> : <PenTool className="w-3 h-3" />}
                        {ft.label}
                      </button>
                    ))}
                  </div>

                  {pendingFieldType && (
                    <div className="mb-2">
                      <Input
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        placeholder={`Label for this ${pendingFieldType} field (optional)`}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}

                  <div className="border-2 border-slate-200 rounded-lg p-4 overflow-x-auto bg-slate-50">
                    <PdfFieldPlacer
                      pdfUrl={pdfSignedUrl}
                      fields={pdfFields}
                      onFieldsChange={setPdfFields}
                      pendingFieldType={pendingFieldType}
                      onPendingFieldPlaced={() => { setPendingFieldType(null); setNewFieldLabel(""); }}
                      newFieldLabel={newFieldLabel}
                    />
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    {pdfFields.length} field{pdfFields.length !== 1 ? "s" : ""} placed
                    {pdfFields.length === 0 && " — the signer will just type their name at the bottom."}
                  </p>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || uploading} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : existing ? "Update Document" : "Create Document"}
          </Button>
        </div>
      </div>
    </div>
  );
}