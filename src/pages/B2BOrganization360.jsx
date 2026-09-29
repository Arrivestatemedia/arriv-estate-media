import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, CreditCard, Users, Calendar, FileText, TrendingUp, Settings, Shield, Loader2, ArrowLeft, Scissors, DollarSign, AlertCircle } from "lucide-react";

export default function B2BOrganization360({ organizationId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const orgId = organizationId || new URLSearchParams(window.location.search).get('org_id');

  useEffect(() => {
    if (orgId) loadData();
  }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getB2BOrganization360", { organization_id: orgId });
      setData(res?.data || res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FFFBF5]">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  const org = data?.organization;
  if (!org) return <div className="p-8 text-center text-[#1A1A1A]/40">Organization not found</div>;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'people', label: 'People', icon: Users },
    { id: 'contract', label: 'Contract', icon: FileText },
    { id: 'entitlements', label: 'Entitlements', icon: CreditCard },
    { id: 'billing', label: 'Billing', icon: DollarSign },
    { id: 'implementation', label: 'Implementation', icon: Settings },
    { id: 'usage', label: 'Usage', icon: TrendingUp },
    { id: 'commissions', label: 'Commissions', icon: Shield },
    { id: 'audit', label: 'Audit', icon: AlertCircle },
  ];

  return (
    <div className="min-h-screen bg-[#FFFBF5]">
      {/* Header */}
      <div className="bg-white border-b border-[#B8956A]/20 px-4 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => window.history.back()} className="text-[#1A1A1A]/60 hover:text-[#1A1A1A]">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-2xl font-serif text-[#1A1A1A]">{org.display_name || org.legal_name}</h1>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-[#1A1A1A]/60">
            <span>Plan: <strong className="text-[#1A1A1A]">{org.plan_id}</strong></span>
            <span>Status: <strong className={org.contract_status === 'active' ? 'text-green-600' : 'text-amber-600'}>{org.contract_status}</strong></span>
            <span>Billing: <strong className="text-[#1A1A1A]">{org.billing_frequency}</strong></span>
            {org.assigned_sales_rep_email && <span>Rep: <strong className="text-[#1A1A1A]">{org.assigned_sales_rep_email}</strong></span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-[#B8956A]/20 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#B8956A] text-[#B8956A]'
                      : 'border-transparent text-[#1A1A1A]/50 hover:text-[#1A1A1A]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'people' && <PeopleTab data={data} orgId={orgId} />}
        {activeTab === 'contract' && <ContractTab data={data} />}
        {activeTab === 'entitlements' && <EntitlementsTab data={data} />}
        {activeTab === 'billing' && <BillingTab data={data} orgId={orgId} />}
        {activeTab === 'implementation' && <ImplementationTab data={data} orgId={orgId} />}
        {activeTab === 'usage' && <UsageTab data={data} />}
        {activeTab === 'commissions' && <CommissionsTab data={data} />}
        {activeTab === 'audit' && <AuditTab data={data} />}
      </div>
    </div>
  );
}

function OverviewTab({ data }) {
  const org = data?.organization;
  const creditPeriod = data?.current_credit_period;
  const capacityPeriod = data?.current_capacity_period;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-3">Organization</h3>
        <div className="space-y-2 text-sm">
          <Row label="Legal Name" value={org?.legal_name} />
          <Row label="Display Name" value={org?.display_name} />
          <Row label="Admin" value={org?.primary_admin_email} />
          <Row label="Sales Rep" value={org?.assigned_sales_rep_email} />
          <Row label="Start Date" value={org?.contract_start_date} />
          <Row label="Renewal Date" value={org?.renewal_date} />
        </div>
      </div>

      {creditPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-3">Media Credits</h3>
          <div className="space-y-2 text-sm">
            <Row label="Allocated" value={`${(creditPeriod.credits_allocated || 0).toFixed(2)}`} />
            <Row label="Available" value={`${((creditPeriod.credits_available_units || 0) / 100).toFixed(2)}`} />
            <Row label="Reserved" value={`${((creditPeriod.credits_reserved_units || 0) / 100).toFixed(2)}`} />
            <Row label="Used" value={`${((creditPeriod.credits_consumed_units || 0) / 100).toFixed(2)}`} />
            <Row label="Resets" value={creditPeriod.period_end} />
          </div>
        </div>
      )}

      {capacityPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-3">Reserved Capacity</h3>
          <div className="space-y-2 text-sm">
            <Row label="Standard" value={capacityPeriod.production_standard} />
            <Row label="Contracted" value={`${capacityPeriod.contracted_shoots} shoots`} />
            <Row label="Available" value={`${capacityPeriod.available_shoots || 0}`} />
            <Row label="Reserved" value={`${capacityPeriod.reserved_shoots || 0}`} />
            <Row label="Consumed" value={`${capacityPeriod.consumed_shoots || 0}`} />
            <Row label="Resets" value={capacityPeriod.period_end} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-3">Implementation</h3>
        <div className="space-y-2 text-sm">
          <Row label="Status" value={org?.implementation_status} />
          <Row label="Current Stage" value={data?.current_implementation_order?.current_stage} />
          <Row label="Go-Live Ready" value={data?.current_implementation_order?.go_live_ready ? 'Yes' : 'No'} />
        </div>
      </div>
    </div>
  );
}

function PeopleTab({ data, orgId }) {
  const members = data?.members || [];
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('full');
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    setInviting(true);
    try {
      await base44.functions.invoke('manageB2BSeats', {
        action: 'invite',
        organization_id: orgId,
        member_email: inviteEmail,
        member_name: inviteName,
        role: inviteRole,
        actor: 'admin',
      });
      setInviteEmail('');
      setInviteName('');
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
    setInviting(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <h3 className="text-sm font-medium text-[#1A1A1A]/60 mb-3">Invite Team Member</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="Name"
            value={inviteName}
            onChange={e => setInviteName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#B8956A]/30 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#B8956A]/30 text-sm"
          />
          <select
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#B8956A]/30 text-sm"
          >
            <option value="full">Full</option>
            <option value="admin">Admin</option>
            <option value="booking_only">Booking Only</option>
          </select>
        </div>
        <button
          onClick={invite}
          disabled={inviting || !inviteEmail}
          className="mt-2 px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium disabled:opacity-50"
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#B8956A]/20">
          <h3 className="text-sm font-medium text-[#1A1A1A]/60">Members ({members.length})</h3>
        </div>
        <div className="divide-y divide-[#B8956A]/10">
          {members.map(m => (
            <div key={m.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-[#1A1A1A]">{m.user_name || m.user_email}</p>
                <p className="text-sm text-[#1A1A1A]/50">{m.user_email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  m.role === 'admin' ? 'bg-[#B8956A]/15 text-[#B8956A]' : 'bg-gray-100 text-gray-600'
                }`}>{m.role}</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>{m.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContractTab({ data }) {
  const contracts = data?.contracts || [];
  return (
    <div className="space-y-4">
      {contracts.map(c => (
        <div key={c.id} className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-[#1A1A1A]">{c.contract_id}</h3>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}>{c.status}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Plan" value={c.plan_id} />
            <Row label="Type" value={c.contract_type} />
            <Row label="Billing" value={c.billing_frequency} />
            <Row label="Term" value={`${c.term_months} months`} />
            <Row label="Monthly" value={`$${c.monthly_price || 0}`} />
            <Row label="Annual" value={`$${c.annual_prepaid_price || 0}`} />
            <Row label="Start" value={c.start_date} />
            <Row label="End" value={c.end_date} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EntitlementsTab({ data }) {
  const creditPeriod = data?.current_credit_period;
  const capacityPeriod = data?.current_capacity_period;
  const seatEntitlement = data?.seat_entitlement;

  return (
    <div className="space-y-4">
      {creditPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <h3 className="font-medium text-[#1A1A1A] mb-3">Media Credit Period</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Allocated" value={`${(creditPeriod.credits_allocated || 0).toFixed(2)} credits`} />
            <Row label="Available" value={`${((creditPeriod.credits_available_units || 0) / 100).toFixed(2)} credits`} />
            <Row label="Reserved" value={`${((creditPeriod.credits_reserved_units || 0) / 100).toFixed(2)} credits`} />
            <Row label="Consumed" value={`${((creditPeriod.credits_consumed_units || 0) / 100).toFixed(2)} credits`} />
            <Row label="Period" value={`${creditPeriod.period_start} to ${creditPeriod.period_end}`} />
            <Row label="Status" value={creditPeriod.status} />
          </div>
        </div>
      )}
      {capacityPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <h3 className="font-medium text-[#1A1A1A] mb-3">Reserved Capacity Period</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Standard" value={capacityPeriod.production_standard} />
            <Row label="Contracted" value={`${capacityPeriod.contracted_shoots} shoots`} />
            <Row label="Available" value={`${capacityPeriod.available_shoots || 0}`} />
            <Row label="Reserved" value={`${capacityPeriod.reserved_shoots || 0}`} />
            <Row label="Consumed" value={`${capacityPeriod.consumed_shoots || 0}`} />
            <Row label="Overage" value={`${capacityPeriod.overage_shoots || 0}`} />
          </div>
        </div>
      )}
      {seatEntitlement && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <h3 className="font-medium text-[#1A1A1A] mb-3">Seats</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Row label="Included Full" value={seatEntitlement.included_full_seats} />
            <Row label="Included Admin" value={seatEntitlement.included_admin_seats} />
            <Row label="Additional Full" value={seatEntitlement.additional_full_seats} />
            <Row label="Additional Admin" value={seatEntitlement.additional_admin_seats} />
            <Row label="Booking Only" value={seatEntitlement.booking_only_seats} />
            <Row label="Total Full" value={seatEntitlement.total_full_seats} />
          </div>
        </div>
      )}
    </div>
  );
}

function BillingTab({ data, orgId }) {
  const invoices = data?.invoices || [];
  const org = data?.organization;
  const [sending, setSending] = useState(false);

  const createAnnualInvoice = async () => {
    setSending(true);
    try {
      await base44.functions.invoke('createB2BAnnualInvoice', { organization_id: orgId });
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
    setSending(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <h3 className="font-medium text-[#1A1A1A] mb-3">Billing Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Model" value={org?.billing_frequency} />
          <Row label="Status" value={org?.contract_status} />
          <Row label="Contact" value={org?.billing_contact_email} />
        </div>
        {org?.billing_frequency === 'annual_prepaid' && (
          <button
            onClick={createAnnualInvoice}
            disabled={sending}
            className="mt-3 px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium disabled:opacity-50"
          >
            {sending ? 'Creating...' : 'Create Annual Invoice'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#B8956A]/20">
          <h3 className="text-sm font-medium text-[#1A1A1A]/60">Invoices</h3>
        </div>
        <div className="divide-y divide-[#B8956A]/10">
          {invoices.length === 0 ? (
            <div className="px-4 py-8 text-center text-[#1A1A1A]/40">No invoices</div>
          ) : invoices.map(inv => (
            <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-[#1A1A1A]">{inv.invoice_type}</p>
                <p className="text-sm text-[#1A1A1A]/50">${inv.amount} · Due {inv.due_date || '—'}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>{inv.payment_status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImplementationTab({ data, orgId }) {
  const implOrder = data?.current_implementation_order;
  const stages = implOrder ? JSON.parse(implOrder.stages_json || '[]') : [];
  const [advancing, setAdvancing] = useState(false);

  const advance = async (stage) => {
    setAdvancing(true);
    try {
      await base44.functions.invoke('manageB2BImplementation', {
        action: 'advance_stage',
        organization_id: orgId,
        new_stage: stage,
        actor: 'admin',
      });
      window.location.reload();
    } catch (e) {
      alert(e.message);
    }
    setAdvancing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
      <h3 className="font-medium text-[#1A1A1A] mb-3">Implementation Progress</h3>
      {!implOrder ? (
        <p className="text-[#1A1A1A]/40">No implementation order</p>
      ) : (
        <div className="space-y-2">
          {stages.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#B8956A]/10 last:border-0">
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  s.status === 'complete' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s.status === 'complete' ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${s.status === 'complete' ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/50'}`}>
                  {s.stage.replace(/_/g, ' ')}
                </span>
              </div>
              {s.status !== 'complete' && (
                <button
                  onClick={() => advance(s.stage)}
                  disabled={advancing}
                  className="px-3 py-1 rounded text-xs bg-[#B8956A]/15 text-[#B8956A] font-medium"
                >
                  Complete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageTab({ data }) {
  const creditLedger = data?.credit_ledger || [];
  const capacityLedger = data?.capacity_ledger || [];

  return (
    <div className="space-y-4">
      {creditLedger.length > 0 && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#B8956A]/20">
            <h3 className="text-sm font-medium text-[#1A1A1A]/60">Credit Ledger</h3>
          </div>
          <div className="divide-y divide-[#B8956A]/10 max-h-96 overflow-y-auto">
            {creditLedger.map(e => (
              <div key={e.id} className="px-4 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-[#1A1A1A]">{e.event_type}</span>
                  <span className={e.amount_units >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {(e.amount_units / 100).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-[#1A1A1A]/40">{e.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {capacityLedger.length > 0 && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#B8956A]/20">
            <h3 className="text-sm font-medium text-[#1A1A1A]/60">Capacity Ledger</h3>
          </div>
          <div className="divide-y divide-[#B8956A]/10 max-h-96 overflow-y-auto">
            {capacityLedger.map(e => (
              <div key={e.id} className="px-4 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-[#1A1A1A]">{e.event_type}</span>
                  <span className={e.amount >= 0 ? 'text-green-600' : 'text-red-600'}>{e.amount}</span>
                </div>
                <p className="text-xs text-[#1A1A1A]/40">{e.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CommissionsTab({ data }) {
  const tranches = data?.commission_tranches || [];
  const events = data?.commission_events || [];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <h3 className="font-medium text-[#1A1A1A] mb-3">Commission Tranches</h3>
        <div className="space-y-2">
          {tranches.map(t => (
            <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-[#B8956A]/10 last:border-0">
              <div>
                <p className="font-medium text-[#1A1A1A]">{t.tranche_kind} · Month {t.lifecycle_month}</p>
                <p className="text-xs text-[#1A1A1A]/50">Basis: ${t.monthly_commission_basis}/mo · Rate: {(t.current_rate * 100).toFixed(0)}%</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs ${
                t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#B8956A]/20">
          <h3 className="text-sm font-medium text-[#1A1A1A]/60">Commission Events</h3>
        </div>
        <div className="divide-y divide-[#B8956A]/10 max-h-96 overflow-y-auto">
          {events.map(e => (
            <div key={e.id} className="px-4 py-2 text-sm flex justify-between">
              <span className="font-medium text-[#1A1A1A]">{e.event_type.replace(/B2B_/g, '').replace(/_/g, ' ')}</span>
              <span className="text-[#1A1A1A]">${e.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuditTab({ data }) {
  const logs = data?.audit_logs || [];
  return (
    <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-[#B8956A]/20">
        <h3 className="text-sm font-medium text-[#1A1A1A]/60">Audit Log</h3>
      </div>
      <div className="divide-y divide-[#B8956A]/10 max-h-[600px] overflow-y-auto">
        {logs.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#1A1A1A]/40">No audit events</div>
        ) : logs.map(log => (
          <div key={log.id} className="px-4 py-2 text-sm">
            <div className="flex justify-between">
              <span className="font-medium text-[#1A1A1A]">{log.action}</span>
              <span className="text-xs text-[#1A1A1A]/40">{new Date(log.timestamp).toLocaleDateString()}</span>
            </div>
            <p className="text-xs text-[#1A1A1A]/50">{log.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#1A1A1A]/50">{label}</span>
      <span className="text-[#1A1A1A] font-medium">{value || '—'}</span>
    </div>
  );
}