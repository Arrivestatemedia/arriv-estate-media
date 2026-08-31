import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, CheckCircle2, X } from "lucide-react";

export default function DiscountRequestModal({ contact, deal, onClose, onSubmitted }) {
  const [step, setStep] = useState('form'); // form | submitting | success | error
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    customer_or_prospect_name: contact ? [contact.firstname, contact.lastname].filter(Boolean).join(' ') : '',
    contact_id: contact?.id || '',
    deal_id: deal?.id || '',
    requested_discount_type: 'PERCENTAGE',
    requested_value: 0,
    reason: '',
  });

  const set = (k, v) => setFormData({ ...formData, [k]: v });

  const handleSubmit = async () => {
    setStep('submitting');
    setError(null);
    try {
      const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
      const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
      const now = new Date().toISOString();
      await base44.entities.DiscountApproval.create({
        ...formData,
        sales_member_id: salesMemberId,
        sales_member_name: salesMemberName,
        status: 'PENDING',
        requested_at: now,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await base44.entities.AuditEvent.create({
        event_type: 'DISCOUNT_REQUESTED',
        sales_member_id: salesMemberId,
        sales_member_name: salesMemberName,
        actor_id: salesMemberId,
        actor_name: salesMemberName,
        actor_role: 'REP',
        entity_type: 'DiscountApproval',
        timestamp: now,
      });
      setStep('success');
      if (onSubmitted) onSubmitted();
    } catch (err) {
      setStep('error');
      setError(err?.message || 'Failed to submit discount request');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <Card className="max-w-md w-full bg-white p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-lg font-bold text-[#1A1A1A]">Request Discount Approval</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        {step === 'form' && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Customer / Prospect</Label>
              <Input value={formData.customer_or_prospect_name} onChange={e => set('customer_or_prospect_name', e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <Label className="text-sm">Discount Type</Label>
              <Select value={formData.requested_discount_type} onValueChange={v => set('requested_discount_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  <SelectItem value="FLAT_AMOUNT">Flat Amount</SelectItem>
                  <SelectItem value="FREE_ADDON">Free Add-On</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Requested Value</Label>
              <Input type="number" value={formData.requested_value} onChange={e => set('requested_value', Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-sm">Business Reason</Label>
              <Textarea value={formData.reason} onChange={e => set('reason', e.target.value)} rows={2} placeholder="Why is this discount needed?" />
            </div>
            <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
              Do NOT promise this discount to the customer until it is approved. Safe language: "Let me verify what I can get approved for you."
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={!formData.customer_or_prospect_name || !formData.reason} onClick={handleSubmit}>
                Submit Request
              </Button>
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="py-8 text-center">
            <div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-600">Submitting discount request…</p>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-[#B8956A] mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#1A1A1A]">Request Submitted</h3>
              <p className="text-sm text-slate-600 mt-1">Your manager will review this discount request. Do not promise the discount until approved.</p>
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <X className="w-14 h-14 text-red-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-[#1A1A1A]">Submission Failed</h3>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setStep('form')}>Try Again</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}