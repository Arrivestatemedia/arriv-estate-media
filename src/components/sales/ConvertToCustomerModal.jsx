import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, CheckCircle2, AlertCircle, X } from "lucide-react";

export default function ConvertToCustomerModal({ contact, onClose, onConverted }) {
  const [step, setStep] = useState('review'); // review | converting | success | duplicate | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [formData, setFormData] = useState({
    email: contact?.email || "",
    full_name: [contact?.firstname, contact?.lastname].filter(Boolean).join(" ") || contact?.name || "",
    phone: contact?.phone || "",
    company: contact?.company || "",
  });

  const handleConvert = async () => {
    setStep('converting');
    setError(null);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
      const res = await base44.functions.invoke('convertLeadToCustomer', {
        contact_id: contact?.id,
        email: formData.email,
        full_name: formData.full_name,
        phone: formData.phone,
        company: formData.company,
        sales_member_id: salesMemberId,
        sales_member_name: salesMemberName,
        lead_source: contact?.lead_status || "",
      });
      const data = res?.data || res;
      if (data.duplicate) {
        setStep('duplicate');
        setResult(data);
      } else if (data.success) {
        setStep('success');
        setResult(data);
        if (onConverted) onConverted(data);
      } else {
        setStep('error');
        setError(data.error || data.message || 'Conversion failed');
      }
    } catch (err) {
      setStep('error');
      setError(err?.data?.error || err?.message || 'Conversion failed');
    }
  };

  const set = (k, v) => setFormData({ ...formData, [k]: v });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="max-w-md w-full bg-white p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-lg font-bold text-[#1A1A1A]">Convert to Customer</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {step === 'review' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Review the customer information before creating their Arriv Estate Media account.</p>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Full Name</Label>
                <Input value={formData.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Customer name" />
              </div>
              <div>
                <Label className="text-sm">Email</Label>
                <Input type="email" value={formData.email} onChange={e => set('email', e.target.value)} placeholder="customer@email.com" />
              </div>
              <div>
                <Label className="text-sm">Phone</Label>
                <Input value={formData.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone number" />
              </div>
              <div>
                <Label className="text-sm">Company / Brokerage</Label>
                <Input value={formData.company} onChange={e => set('company', e.target.value)} placeholder="Company" />
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              A secure temporary password will be generated and emailed to the customer via Brevo.
              You will not see the password. The customer must change it on first login.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={!formData.email || !formData.full_name} onClick={handleConvert}>
                <UserPlus className="w-4 h-4 mr-1" /> Convert to Customer
              </Button>
            </div>
          </div>
        )}

        {step === 'converting' && (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-600">Creating customer account and sending onboarding email…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-[#B8956A] mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#1A1A1A]">Customer Account Created</h3>
              <p className="text-sm text-slate-600 mt-1">{result?.customer_name} ({result?.customer_email})</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <Badge className={result?.email_sent ? "bg-[#B8956A] text-[#1A1A1A]" : "bg-red-100 text-red-700"}>
                  {result?.email_sent ? "✓ Onboarding Email Sent" : "⚠ Email Failed"}
                </Badge>
                {result?.contact_updated && <Badge className="bg-blue-100 text-blue-700">Lead Updated</Badge>}
              </div>
              {!result?.email_sent && (
                <p className="text-xs text-red-600 mt-2">Email delivery failed: {result?.email_error}. You can resend from the customer record.</p>
              )}
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {step === 'duplicate' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <AlertCircle className="w-14 h-14 text-orange-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#1A1A1A]">Account Already Exists</h3>
              <p className="text-sm text-slate-600 mt-1">An Arriv Estate Media account already exists for {result?.existing_email}.</p>
              <p className="text-xs text-slate-500 mt-2">Link this lead to the existing customer instead of creating a duplicate.</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#1A1A1A]">Conversion Failed</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setStep('review')}>Try Again</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}