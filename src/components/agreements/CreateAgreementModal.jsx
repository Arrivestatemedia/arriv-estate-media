import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Upload, Copy, FileCheck } from "lucide-react";

export default function CreateAgreementModal({ open, onClose, organizationId, contractId, quoteId, salesRepEmail, onCreated, context = "b2b" }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    agreement_type: context === "b2b" ? "B2B_SERVICE_AGREEMENT" : "",
    source_type: "template",
    routing_type: "parallel",
  });

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageSignDocuments", {
        action: "list",
        category: context === "b2b" ? "b2b" : "hr",
      });
      const data = res?.data || res;
      const docs = data?.documents || [];
      setTemplates(docs.filter(d => d.active !== false));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      let res;
      if (formData.source_type === "duplicate" && selectedTemplate) {
        res = await base44.functions.invoke("manageSignDocuments", {
          action: "duplicate",
          source_id: selectedTemplate.id,
          sales_rep_email: salesRepEmail || "",
        });
      } else if (formData.source_type === "b2b_quote") {
        res = await base44.functions.invoke("manageSignDocuments", {
          action: "create_from_b2b_quote",
          quote_id: quoteId || "",
          contract_id: contractId || "",
          organization_id: organizationId || "",
          organization_name: organizationId || "",
          sales_rep_email: salesRepEmail || "",
          title: formData.name,
        });
      } else {
        // template or upload — create a SignDocument
        const createBody = {
          action: "create",
          title: formData.name,
          source_type: formData.source_type === "upload" ? "upload" : "editor",
          document_type: context === "b2b" ? "custom" : "custom",
          organization_id: organizationId || "",
          sales_rep_email: salesRepEmail || "",
          category: context === "b2b" ? "b2b" : "hr",
          agreement_type: formData.agreement_type || "",
        };
        if (formData.source_type === "template" && selectedTemplate) {
          // Copy the template content into a new document
          createBody.body_html = selectedTemplate.body_html || "";
          createBody.body_ref = selectedTemplate.body_ref || "";
          createBody.source_type = selectedTemplate.source_type || "editor";
          createBody.signature_fields = selectedTemplate.signature_fields || [];
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

  const sourceOptions = context === "b2b"
    ? [
        { value: "template", label: "Create from template", icon: FileText },
        { value: "upload", label: "Upload document", icon: Upload },
        { value: "duplicate", label: "Duplicate previous", icon: Copy },
        { value: "b2b_quote", label: "Create from B2B quote/contract", icon: FileCheck },
      ]
    : [
        { value: "template", label: "Create from template", icon: FileText },
        { value: "upload", label: "Upload document", icon: Upload },
        { value: "duplicate", label: "Duplicate previous", icon: Copy },
      ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Agreement</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">How would you like to create this agreement?</Label>
              <div className="grid grid-cols-2 gap-2">
                {sourceOptions.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, source_type: opt.value }));
                        if (opt.value === "template") setStep(2);
                        else setStep(3);
                      }}
                      className="flex flex-col items-center gap-2 p-4 border border-[#B8956A]/30 rounded-lg hover:border-[#B8956A] hover:bg-[#B8956A]/5 transition-all"
                    >
                      <Icon className="w-6 h-6 text-[#B8956A]" />
                      <span className="text-sm text-[#1A1A1A]">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" /></div>
            ) : (
              <>
                <div>
                  <Label className="mb-2 block">Select Template</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t)}
                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                          selectedTemplate?.id === t.id
                            ? "border-[#B8956A] bg-[#B8956A]/10"
                            : "border-[#B8956A]/20 hover:border-[#B8956A]/50"
                        }`}
                      >
                        <p className="font-medium text-[#1A1A1A]">{t.name}</p>
                        <p className="text-xs text-[#1A1A1A]/50">{t.category.replace(/_/g, ' ')} · v{t.current_version_number}</p>
                      </button>
                    ))}
                    {templates.length === 0 && (
                      <p className="text-sm text-[#1A1A1A]/40 text-center py-4">No active templates. Create one first.</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!selectedTemplate}
                    className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
                  >
                    Continue
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-1 block">Agreement Name</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Enterprise Services Agreement — Acme Corp"
              />
            </div>
            <div>
              <Label className="mb-1 block">Agreement Type</Label>
              <select
                className="w-full border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
                value={formData.agreement_type}
                onChange={e => setFormData(prev => ({ ...prev, agreement_type: e.target.value }))}
              >
                {context === "b2b" ? (
                  <>
                    <option value="B2B_SERVICE_AGREEMENT">B2B Service Agreement</option>
                    <option value="ORDER_FORM">Order Form</option>
                    <option value="STATEMENT_OF_WORK">Statement of Work</option>
                    <option value="AMENDMENT">Amendment</option>
                    <option value="RENEWAL">Renewal</option>
                    <option value="NDA">NDA</option>
                    <option value="OTHER">Other</option>
                  </>
                ) : (
                  <>
                    <option value="">General Document</option>
                    <option value="NDA">NDA</option>
                    <option value="OTHER">Other</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <Label className="mb-1 block">Signing Order</Label>
              <select
                className="w-full border border-[#B8956A]/30 rounded-lg px-3 py-2 text-sm"
                value={formData.routing_type}
                onChange={e => setFormData(prev => ({ ...prev, routing_type: e.target.value }))}
              >
                <option value="parallel">Parallel (all at once)</option>
                <option value="sequential">Sequential (in order)</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(formData.source_type === "template" ? 2 : 1)}>Back</Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !formData.name}
                className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                Create Agreement
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}