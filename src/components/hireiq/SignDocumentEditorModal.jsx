import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileText, X, FileCheck, Trash2, PenTool, MousePointerClick } from "lucide-react";

const DOC_TYPES = [
  { value: "offer_letter", label: "Offer Letter" },
  { value: "employment_agreement", label: "Employment Agreement" },
  { value: "nda", label: "NDA" },
  { value: "addendum", label: "Addendum" },
  { value: "w9", label: "W-9" },
  { value: "ica", label: "ICA" },
  { value: "custom", label: "Custom Document" },
];

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
  const [bodyHtml, setBodyHtml] = useState(existing?.body_html || "");
  const [fileUri, setFileUri] = useState(existing?.body_ref || "");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pdfFields, setPdfFields] = useState(existing?.signature_fields || []);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingFieldType, setPendingFieldType] = useState(null);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const textareaRef = useRef(null);
  const pdfAreaRef = useRef(null);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      const data = res?.data || res;
      const uri = data?.file_uri;
      if (!uri) throw new Error("Upload failed — no file URI returned");
      setFileUri(uri);
      setFileName(file.name);
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

  const handlePdfClick = (e) => {
    if (!pendingFieldType) return;
    const rect = pdfAreaRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const ft = FIELD_TYPES.find(f => f.type === pendingFieldType);
    const label = newFieldLabel.trim() || ft?.placeholder || "Field";
    const fieldId = `${label.replace(/\s+/g, "_").toLowerCase()}_${Date.now().toString(36)}`;
    setPdfFields((prev) => [...prev, {
      field_id: fieldId,
      type: pendingFieldType,
      label,
      required: true,
      x: Math.round(xPct * 10) / 10,
      y: Math.round(yPct * 10) / 10,
      page: currentPage,
      width: pendingFieldType === "signature" || pendingFieldType === "name" ? 35 : 20,
    }]);
    setPendingFieldType(null);
    setNewFieldLabel("");
  };

  const removePdfField = (idx) => {
    setPdfFields((prev) => prev.filter((_, i) => i !== idx));
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

  const pdfUrl = fileUri ? `${fileUri}#page=${currentPage}` : "";

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
              onChange={(e) => setDocType(e.target.value)}
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
                <Upload className="w-4 h-4" /> Upload PDF
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
                <Label className="text-sm font-medium text-slate-700">Document Body (HTML)</Label>
                <Textarea
                  ref={textareaRef}
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  placeholder="<h1>Offer of Employment</h1><p>Dear {{candidate_name}}, ...</p><p>Signed: {{sig:Signature}} on {{date:Date}}</p>"
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label className="text-sm font-medium text-slate-700">Upload PDF</Label>
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
                      <p className="text-sm">Click to upload a PDF</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
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
                            : `bg-white text-slate-600 border-slate-200 hover:border-[#B8956A]/40 ${FIELD_COLORS[ft.type]}`
                        }`}
                      >
                        {pendingFieldType === ft.type ? <MousePointerClick className="w-3 h-3" /> : <PenTool className="w-3 h-3" />}
                        {ft.label}
                      </button>
                    ))}
                    <div className="flex items-center gap-1 ml-auto">
                      <Label className="text-xs text-slate-500">Page:</Label>
                      <Input
                        type="number"
                        min="1"
                        value={currentPage}
                        onChange={(e) => setCurrentPage(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 h-8 text-sm"
                      />
                    </div>
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

                  <div
                    ref={pdfAreaRef}
                    onClick={handlePdfClick}
                    className={`relative w-full border-2 rounded-lg overflow-hidden ${pendingFieldType ? "cursor-crosshair border-[#B8956A]" : "border-slate-200"}`}
                    style={{ height: "800px" }}
                  >
                    <iframe
                      src={pdfUrl}
                      className="absolute inset-0 w-full h-full"
                      style={{ pointerEvents: pendingFieldType ? "none" : "auto" }}
                      title="PDF Preview"
                    />
                    {pdfFields.filter(f => f.page === currentPage || (!f.page && currentPage === 1)).map((f) => {
                      const realIdx = pdfFields.indexOf(f);
                      return (
                        <div
                          key={f.field_id}
                          className={`absolute border-2 rounded-md shadow-sm ${FIELD_COLORS[f.type] || FIELD_COLORS.text}`}
                          style={{
                            left: `${f.x}%`,
                            top: `${f.y}%`,
                            width: `${f.width}%`,
                            minHeight: "40px",
                            pointerEvents: "auto",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between px-1.5 py-0.5">
                            <span className="text-xs font-medium text-slate-700 capitalize">{f.label}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); removePdfField(realIdx); }}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-xs text-slate-400 px-1.5 pb-1 capitalize">{f.type}</div>
                        </div>
                      );
                    })}
                    {pendingFieldType && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[#B8956A] text-white text-xs px-3 py-1 rounded-full shadow-lg">
                        Click on the PDF to place the {pendingFieldType} field
                      </div>
                    )}
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