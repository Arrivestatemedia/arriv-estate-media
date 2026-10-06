import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Upload, Copy, Plus } from "lucide-react";
import SignDocumentEditorModal from "./SignDocumentEditorModal";

const HR_AGREEMENT_TYPES = [
  { value: "", label: "General Document" },
  { value: "NDA", label: "NDA" },
  { value: "OTHER", label: "Other" },
];

export default function NewSignDocumentPickerModal({ open, onClose, salesMemberId, onCreated }) {
  const [step, setStep] = useState(0); // 0 = picker, 1 = select template/duplicate, 2 = name + details
  const [sourceType, setSourceType] = useState("");
  const [templates, setTemplates] = useState([]);
  const [allDocs, setAllDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [uploadedFileUri, setUploadedFileUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [agreementType, setAgreementType] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSourceType("");
      setSelected(null);
      setUploadedFileUri("");
      setName("");
      setAgreementType("");
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageSignDocuments", { action: "list", sales_member_id: salesMemberId });
      const data = res?.data || res;
      setTemplates((data?.documents || []).filter(d => d.active !== false));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadAllDocs = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageSignDocuments", { action: "list_all", sales_member_id: salesMemberId });
      const data = res?.data || res;
      setAllDocs(data?.documents || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleFileUpload = async (file) => {
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      const data = res?.data || res;
      setUploadedFileUri(data?.file_uri || "");
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    setUploading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      let res;
      if (sourceType === "duplicate" && selected) {
        res = await base44.functions.invoke("manageSignDocuments", {
          action: "duplicate",
          source_id: selected.id,
          category: "hr",
          sales_rep_email: "",
        });
      } else {
        const createBody = {
          action: "create",
          title: name,
          source_type: sourceType === "upload" ? "upload" : "editor",
          document_type: "custom",
          category: "hr",
          agreement_type: agreementType || "",
          sales_member_id: salesMemberId,
        };
        if (sourceType === "template" && selected) {
          createBody.body_html = selected.body_html || "";
          createBody.body_ref = selected.body_ref || "";
          createBody.source_type = selected.source_type || "editor";
          createBody.signature_fields = selected.signature_fields || [];
        }
        if (sourceType === "upload" && uploadedFileUri) {
          createBody.body_ref = uploadedFileUri;
          createBody.source_type = "upload";
        }
        res = await base44.functions.invoke("manageSignDocuments", createBody);
      }
      const data = res?.data || res;
      if (data?.success || data?.document?.id) {
        onCreated?.(data.document?.id || data?.id);
        onClose?.();
      } else {
        throw new Error(data?.error || "Failed to create document");
      }
    } catch (e) {
      alert(e.message);
    }
    setCreating(false);
  };

  const options = [
    { value: "blank", label: "Blank rich-text document", icon: Plus, desc: "Start from scratch in the editor" },
    { value: "template", label: "Create from template", icon: FileText, desc: "Copy an existing HR template" },
    { value: "upload", label: "Upload document", icon: Upload, desc: "Upload a finished PDF" },
    { value: "duplicate", label: "Duplicate previous", icon: Copy, desc: "Clone any existing document" },
  ];

  const selectList = sourceType === "duplicate" ? allDocs : templates;

  return (
    <>
      <Dialog open={open && !editorOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>

          {step === 0 && (
            <div className="space-y-4">
              <Label className="mb-2 block">How would you like to create this document?</Label>
              <div className="grid grid-cols-2 gap-2">
                {options.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSourceType(opt.value);
                        if (opt.value === "blank") {
                          setEditorOpen(true);
                        } else if (opt.value === "template") {
                          loadTemplates();
                          setStep(1);
                        } else if (opt.value === "duplicate") {
                          loadAllDocs();
                          setStep(1);
                        } else {
                          setStep(2);
                        }
                      }}
                      className="flex flex-col items-center gap-2 p-4 border border-[#B8956A]/30 rounded-lg hover:border-[#B8956A] hover:bg-[#B8956A]/5 transition-all text-center"
                    >
                      <Icon className="w-6 h-6 text-[#B8956A]" />
                      <span className="text-sm font-medium text-[#1A1A1A]">{opt.label}</span>
                      <span className="text-xs text-[#1A1A1A]/50">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" /></div>
              ) : (
                <>
                  <Label className="mb-2 block">
                    {sourceType === "duplicate" ? "Select any document to clone" : "Select Template"}
                  </Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {selectList.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelected(t)}
                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                          selected?.id === t.id
                            ? "border-[#B8956A] bg-[#B8956A]/10"
                            : "border-[#B8956A]/20 hover:border-[#B8956A]/50"
                        }`}
                      >
                        <p className="font-medium text-[#1A1A1A]">{t.title}</p>
                        <p className="text-xs text-[#1A1A1A]/50">
                          {(t.agreement_type || t.category || 'general').replace(/_/g, ' ')} · v{t.version || '1.0'}
                          {sourceType === "duplicate" && t.category === 'b2b' && ' · B2B'}
                        </p>
                      </button>
                    ))}
                    {selectList.length === 0 && (
                      <p className="text-sm text-[#1A1A1A]/40 text-center py-4">
                        {sourceType === "duplicate" ? "No documents found." : "No active templates. Create one first."}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!selected}
                      className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
                    >
                      Continue
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {sourceType !== "duplicate" && (
                <div>
                  <Label className="mb-1 block">Document Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Offer Letter — John Doe" />
                </div>
              )}
              {sourceType !== "duplicate" && (
                <div>
                  <Label className="mb-1 block">Agreement Type</Label>
                  <select
                    className="w-full border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
                    value={agreementType}
                    onChange={e => setAgreementType(e.target.value)}
                  >
                    {HR_AGREEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
              {sourceType === "upload" && (
                <div>
                  <Label className="mb-1 block">Upload PDF Document</Label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    className="w-full text-sm"
                  />
                  {uploading && <p className="text-xs text-[#B8956A] mt-1">Uploading...</p>}
                  {uploadedFileUri && <p className="text-xs text-green-600 mt-1">File uploaded ✓</p>}
                </div>
              )}
              {sourceType === "duplicate" && selected && (
                <p className="text-sm text-[#1A1A1A]/60">
                  Cloning <span className="font-medium">{selected.title}</span> into a new HR document.
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep(sourceType === "template" || sourceType === "duplicate" ? 1 : 0)}>Back</Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || (sourceType !== "duplicate" && !name) || (sourceType === "upload" && !uploadedFileUri)}
                  className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                  {sourceType === "duplicate" ? "Clone Document" : "Create Document"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {editorOpen && (
        <SignDocumentEditorModal
          existing={null}
          salesMemberId={salesMemberId}
          onClose={() => { setEditorOpen(false); onClose?.(); }}
          onSaved={() => { setEditorOpen(false); onCreated?.(); }}
        />
      )}
    </>
  );
}