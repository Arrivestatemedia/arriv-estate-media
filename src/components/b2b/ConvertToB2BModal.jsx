import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Loader2, Check, ChevronRight } from "lucide-react";

export default function ConvertToB2BModal({ contact, onClose, onConverted }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [form, setForm] = useState({
    legal_name: contact?.company || contact?.full_name || '',
    display_name: contact?.company || contact?.full_name || '',
    billing_contact_email: contact?.email || '',
    billing_contact_name: contact?.full_name || '',
    primary_admin_email: contact?.email || '',
    primary_admin_name: contact?.full_name || '',
    sales_rep_id: contact?.sales_member_id || '',
    sales_rep_email: contact?.sales_member_email || '',
    plan_id: 'business',
    contract_type: 'business',
    billing_frequency: 'monthly',
    term_months: 12,
    additional_full_seats: 0,
    additional_admin_seats: 0,
    booking_only_seats: 0,
    initial_user_count: 10,
    start_date: new Date().toISOString().split('T')[0],
    renewal_type: 'manual_renew',
    account_id: contact?.account_id || '',
  });

  const steps = [
    'Organization', 'Commercial Plan', 'Billing', 'Seats', 'Entitlements',
    'Implementation', 'Economics Review', 'Quote/Contract', 'Conversion', 'Provisioning'
  ];

  const getQuote = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('buildB2BQuote', {
        plan_id: form.plan_id,
        contract_type: form.contract_type,
        billing_frequency: form.billing_frequency,
        term_months: form.term_months,
        additional_full_seats: form.additional_full_seats,
        additional_admin_seats: form.additional_admin_seats,
        booking_only_seats: form.booking_only_seats,
        initial_user_count: form.initial_user_count,
      });
      setQuote(res?.data || res);
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  const convert = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('convertToB2BOrganization', {
        ...form,
        idempotency_key: `convert_${contact?.id || Date.now()}`,
        actor: 'admin',
      });
      const result = res?.data || res;
      if (result.success || result.partial) {
        onConverted?.(result);
        onClose?.();
      } else {
        alert(result.errors?.join(', ') || 'Conversion failed');
      }
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  };

  const next = () => {
    if (step === 7 && !quote) { getQuote(); return; }
    setStep(s => Math.min(10, s + 1));
  };
  const prev = () => setStep(s => Math.max(1, s - 1));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[#B8956A]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-lg font-medium text-[#1A1A1A]">Convert to B2B Organization</h2>
          </div>
          <button onClick={onClose} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]">✕</button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b border-[#B8956A]/10">
          <div className="flex items-center gap-1 text-xs">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  i + 1 < step ? 'bg-green-500 text-white' : i + 1 === step ? 'bg-[#B8956A] text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i + 1 < step ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i + 1 < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-[#1A1A1A]/60">{steps[step - 1]}</p>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-3">
              <Field label="Legal Company Name" value={form.legal_name} onChange={v => setForm({ ...form, legal_name: v })} />
              <Field label="Display Name" value={form.display_name} onChange={v => setForm({ ...form, display_name: v })} />
              <Field label="Billing Contact Email" value={form.billing_contact_email} onChange={v => setForm({ ...form, billing_contact_email: v })} />
              <Field label="Primary Admin Email" value={form.primary_admin_email} onChange={v => setForm({ ...form, primary_admin_email: v })} />
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-[#1A1A1A]/60 mb-1 block">Plan</label>
                <select value={form.plan_id} onChange={e => setForm({ ...form, plan_id: e.target.value, contract_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#B8956A]/30">
                  <option value="business">Business — $1,500/mo</option>
                  <option value="portfolio">Portfolio — $3,500/mo</option>
                  <option value="developer">Developer — $7,500/mo</option>
                  <option value="enterprise">Enterprise — $12,500/mo</option>
                  <option value="reserved_capacity">Reserved Capacity</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[#1A1A1A]/60 mb-1 block">Billing Frequency</label>
                <select value={form.billing_frequency} onChange={e => setForm({ ...form, billing_frequency: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#B8956A]/30">
                  <option value="monthly">Monthly</option>
                  <option value="annual_prepaid">Annual Prepaid</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-[#1A1A1A]/60 mb-1 block">Contract Term (months)</label>
                <input type="number" value={form.term_months} onChange={e => setForm({ ...form, term_months: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-[#B8956A]/30" />
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <Field label="Billing Contact Name" value={form.billing_contact_name} onChange={v => setForm({ ...form, billing_contact_name: v })} />
              <Field label="Start Date" type="date" value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} />
              <div>
                <label className="text-sm text-[#1A1A1A]/60 mb-1 block">Renewal Type</label>
                <select value={form.renewal_type} onChange={e => setForm({ ...form, renewal_type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#B8956A]/30">
                  <option value="auto_renew">Auto Renew</option>
                  <option value="manual_renew">Manual Renew</option>
                  <option value="month_to_month">Month to Month</option>
                  <option value="non_renewing">Non-Renewing</option>
                </select>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <Field label="Initial User Count" type="number" value={form.initial_user_count} onChange={v => setForm({ ...form, initial_user_count: parseInt(v) || 0 })} />
              <Field label="Additional Full Seats" type="number" value={form.additional_full_seats} onChange={v => setForm({ ...form, additional_full_seats: parseInt(v) || 0 })} />
              <Field label="Additional Admin Seats" type="number" value={form.additional_admin_seats} onChange={v => setForm({ ...form, additional_admin_seats: parseInt(v) || 0 })} />
              <Field label="Booking-Only Seats" type="number" value={form.booking_only_seats} onChange={v => setForm({ ...form, booking_only_seats: parseInt(v) || 0 })} />
            </div>
          )}
          {step === 5 && <div className="text-sm text-[#1A1A1A]/60">Entitlements are determined by the selected plan. Media Credits or Reserved Capacity will be allocated monthly.</div>}
          {step === 6 && <div className="text-sm text-[#1A1A1A]/60">Implementation will be tracked through 13 stages from contract complete to go-live.</div>}
          {step === 7 && (
            <div>
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" /></div>
              ) : quote ? (
                <div className="space-y-2 text-sm">
                  <Row label="Plan" value={quote.plan_name} />
                  <Row label="Monthly" value={`$${quote.effective_monthly}`} />
                  <Row label="Annual" value={`$${quote.effective_annual}`} />
                  <Row label="Implementation" value={`$${quote.total_implementation}`} />
                  <Row label="Seat Charges/mo" value={`$${quote.monthly_seat_charges}`} />
                  <Row label="First Year Total" value={`$${quote.first_year_total}`} bold />
                  <Row label="Monthly Recurring" value={`$${quote.monthly_recurring}`} bold />
                </div>
              ) : (
                <button onClick={getQuote} className="px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium">Generate Quote</button>
              )}
            </div>
          )}
          {step === 8 && quote && (
            <div className="space-y-2 text-sm">
              <p className="text-[#1A1A1A]/60">Review the quote and proceed to conversion.</p>
              <Row label="Plan" value={quote.plan_name} />
              <Row label="Contract Value" value={`$${quote.first_year_total}`} bold />
              <Row label="Config Versions" value={quote.config_versions.plan} />
            </div>
          )}
          {step === 9 && (
            <div className="text-sm text-[#1A1A1A]/60">
              <p className="mb-2">Ready to convert. This will create:</p>
              <ul className="list-disc list-inside space-y-1 text-[#1A1A1A]/80">
                <li>B2B Organization</li>
                <li>Company Admin Member</li>
                <li>B2B Contract + Version (locked config)</li>
                <li>Commercial Snapshot</li>
                <li>Seat Entitlement</li>
                <li>Implementation Order</li>
                <li>Commission Tranche</li>
                <li>{form.billing_frequency === 'monthly' ? 'Payroll Billing Enrollment' : 'Annual Invoice'}</li>
              </ul>
            </div>
          )}
          {step === 10 && (
            <div className="text-center py-8">
              {loading ? (
                <div className="flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>
              ) : (
                <>
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-lg font-medium text-[#1A1A1A]">Provisioning Complete</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#B8956A]/20 flex justify-between">
          <button onClick={prev} disabled={step === 1}
            className="px-4 py-2 rounded-lg text-sm text-[#1A1A1A]/60 disabled:opacity-30">Back</button>
          {step < 9 ? (
            <button onClick={next} className="px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium">
              Next <ChevronRight className="w-4 h-4 inline" />
            </button>
          ) : step === 9 ? (
            <button onClick={convert} disabled={loading}
              className="px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium disabled:opacity-50">
              {loading ? 'Converting...' : 'Convert & Provision'}
            </button>
          ) : (
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium">Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type }) {
  return (
    <div>
      <label className="text-sm text-[#1A1A1A]/60 mb-1 block">{label}</label>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[#B8956A]/30" />
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#1A1A1A]/50">{label}</span>
      <span className={bold ? "font-semibold text-[#1A1A1A]" : "text-[#1A1A1A]"}>{value}</span>
    </div>
  );
}