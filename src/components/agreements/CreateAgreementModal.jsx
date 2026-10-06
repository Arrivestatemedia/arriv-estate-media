import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Upload, Send } from "lucide-react";

export default function CreateAgreementModal({ open, onClose, organizationId, contractId, quoteId, salesRepEmail, salesMemberId, onCreated }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    recipient_name: "",
    recipient_email: "",
    require_signing_order: false,
  });

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageSignDocuments", { action: "list" });
      const data = res?.data || res;
      const all = data?.documents || [];
      // Filter to agreement-category templates only
      setTemplates(all.filter((t) => t.document_category === "agreement" && t.active));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;
    if (!formData.recipient_email) {
      alert("Recipient email is required");
      return;
    }
    setCreating(true);
    try {
      const res = await base44.functions.invoke("sendSignRequest", {
        document_id: selectedTemplate.document_id,
        recipient_email: formData.recipient_email,
        recipient_name: formData.recipient_name,
        require_signing_order: formData.require_signing_order,
        sales_member_id: salesMemberId,
      });
      const data = res?.data || res;
      if (data?.success || data?.signRequest) {
        onCreated?.(data?.signRequest?.request_id);
        onClose?.();
      } else {
        throw new Error(data?.error || "Failed to send agreement");
      }
    } catch (e) {
      alert(e.message);
    }
    setCreating(false);
  };

  const sourceOptions = [
    { value: "template", label: "Create from template", icon: FileText },
    { value: "upload", label: "Upload document", icon: Upload },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Agreement</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">How would you like to create this agreement?</Label>
              <div className="grid grid-cols-2 gap-2">
                {sourceOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setStep(2)}
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
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
              </div>
            ) : (
              <>
                <div>
                  <Label className="mb-2 block">Select Template</Label>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t)}
                        className={`w-full text-left p-3 border rounded-lg transition-all ${
                          selectedTemplate?.id === t.id
                            ? "border-[#B8956A] bg-[#B8956A]/10"
                            : "border-[#B8956A]/20 hover:border-[#B8956A]/50"
                        }`}
                      >
                        <p className="font-medium text-[#1A1A1A]">{t.title}</p>
                        <p className="text-xs text-[#1A1A1A]/50">
                          {t.document_type} · v{t.version || "1.0"}
                        </p>
                      </button>
                    ))}
                    {templates.length === 0 && (
                      <p className="text-sm text-[#1A1A1A]/40 text-center py-4">
                        No agreement templates yet. Create a SignDocument with category "agreement" first.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
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
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Enterprise Services Agreement — Acme Corp"
              />
            </div>
            <div>
              <Label className="mb-1 block">Recipient Name</Label>
              <Input
                value={formData.recipient_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, recipient_name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div>
              <Label className="mb-1 block">Recipient Email</Label>
              <Input
                type="email"
                value={formData.recipient_email}
                onChange={(e) => setFormData((prev) => ({ ...prev, recipient_email: e.target.value }))}
                placeholder="john@company.com"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={creating || !formData.recipient_email}
                className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559] flex-1"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send for Signature
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}