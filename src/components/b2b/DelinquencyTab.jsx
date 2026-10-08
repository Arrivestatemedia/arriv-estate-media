import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2, Shield, Clock, DollarSign, X } from "lucide-react";

export default function DelinquencyTab() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageB2BDelinquency", { action: "get_delinquency_dashboard" });
      setDashboard(res?.data || res);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleAction = async (action, orgId, extra = {}) => {
    setActionLoading(`${action}_${orgId}`);
    try {
      await base44.functions.invoke("manageB2BDelinquency", { action, organization_id: orgId, ...extra });
      await loadDashboard();
    } catch (e) {
      alert(`Action failed: ${e.message}`);
    }
    setActionLoading(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" /></div>;
  }

  const orgs = dashboard?.organizations || [];

  if (orgs.length === 0) {
    return (
      <div className="text-center py-12 text-[#1A1A1A]/40">
        <Shield className="w-10 h-10 mx-auto mb-2 text-[#B8956A]/30" />
        <p>No delinquent B2B accounts. All invoices current.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orgs.map((org) => (
        <DelinquencyCard
          key={org.organization_id}
          org={org}
          actionLoading={actionLoading}
          onAction={handleAction}
        />
      ))}
    </div>
  );
}

function DelinquencyCard({ org, actionLoading, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);

  const daysPastDue = org.max_days_past_due || 0;
  const isRestricted = org.booking_restricted;
  const hasException = org.management_exception_active;
  const isEnterprise = org.classification === 'enterprise_developer_corporate';

  const statusColor = isRestricted ? 'bg-red-500' : daysPastDue > 0 ? 'bg-amber-500' : 'bg-[#B8956A]';
  const statusLabel = isRestricted ? 'Restricted' : hasException ? 'Exception Active' : daysPastDue > 0 ? `${daysPastDue}d past due` : 'Outstanding';

  return (
    <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#B8956A]/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
          <div>
            <p className="font-medium text-[#1A1A1A]">{org.organization_name}</p>
            <p className="text-xs text-[#1A1A1A]/50">
              {org.classification?.replace(/_/g, ' ') || 'unclassified'}
              {org.grace_period_days ? ` · ${org.grace_period_days}d grace` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#1A1A1A]/70">{statusLabel}</span>
          {isRestricted && <AlertTriangle className="w-4 h-4 text-red-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#B8956A]/10 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoTile icon={DollarSign} label="Outstanding" value={`$${(org.outstanding_balance || 0).toLocaleString()}`} />
            <InfoTile icon={Clock} label="Max Days Past Due" value={daysPastDue} />
            <InfoTile icon={AlertTriangle} label="Unpaid Invoices" value={org.unpaid_invoice_count || 0} />
            <InfoTile icon={Shield} label="Tier" value={org.delinquency_tier?.replace(/_/g, ' ') || 'unclassified'} />
          </div>

          {org.oldest_past_due_date && (
            <p className="text-xs text-[#1A1A1A]/50">Oldest past due: {org.oldest_past_due_date}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {isEnterprise && !isRestricted && daysPastDue > 0 && (
              <ActionButton
                loading={actionLoading === `approve_enterprise_restriction_${org.organization_id}`}
                onClick={() => onAction('approve_enterprise_restriction', org.organization_id)}
                label="Approve Restriction"
                className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
              />
            )}
            {!hasException && daysPastDue > 0 && (
              <ActionButton
                loading={actionLoading === `approve_management_exception_${org.organization_id}`}
                onClick={() => onAction('approve_management_exception', org.organization_id, { reason: 'Payment arrangement' })}
                label="Approve Exception"
                className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
              />
            )}
            <ActionButton
              onClick={() => setShowTierModal(true)}
              label="Set Tier"
              className="bg-[#B8956A]/10 text-[#B8956A] border border-[#B8956A]/30 hover:bg-[#B8956A]/20"
            />
          </div>

          {showTierModal && (
            <TierModal
              org={org}
              onClose={() => setShowTierModal(false)}
              onSet={async (tier) => {
                await onAction('set_delinquency_tier', org.organization_id, { delinquency_tier: tier });
                setShowTierModal(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }) {
  return (
    <div className="bg-[#FFFBF5] rounded-lg p-2.5 border border-[#B8956A]/10">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3 text-[#B8956A]" />
        <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      </div>
      <p className="text-sm font-medium text-[#1A1A1A] capitalize">{value}</p>
    </div>
  );
}

function ActionButton({ loading, onClick, label, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : label}
    </button>
  );
}

function TierModal({ org, onClose, onSet }) {
  const tiers = [
    { value: 'individual_agent_small_team', label: 'Individual Agent / Small Team', grace: '7 days' },
    { value: 'small_midsize_brokerage', label: 'Small-Midsize Brokerage', grace: '14 days' },
    { value: 'large_brokerage_property_mgmt', label: 'Large Brokerage / Property Mgmt', grace: '21 days' },
    { value: 'enterprise_developer_corporate', label: 'Enterprise / Developer / Corporate', grace: '30 days' },
    { value: 'unclassified', label: 'Unclassified (Admin Review)', grace: '—' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-[#1A1A1A]">Set Delinquency Tier</h4>
          <button onClick={onClose}><X className="w-4 h-4 text-[#1A1A1A]/40" /></button>
        </div>
        <p className="text-xs text-[#1A1A1A]/50 mb-3">Determines grace period before booking restrictions apply.</p>
        <div className="space-y-1.5">
          {tiers.map(t => (
            <button
              key={t.value}
              onClick={() => onSet(t.value)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                org.delinquency_tier === t.value
                  ? 'bg-[#B8956A] text-white'
                  : 'bg-[#FFFBF5] text-[#1A1A1A] hover:bg-[#B8956A]/10'
              }`}
            >
              <span>{t.label}</span>
              <span className="text-xs opacity-70">{t.grace}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}