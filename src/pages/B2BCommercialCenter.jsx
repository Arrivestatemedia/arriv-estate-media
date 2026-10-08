import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, TrendingUp, DollarSign, Users, AlertTriangle, Calendar, ChevronRight, Loader2, Shield } from "lucide-react";
import DelinquencyTab from "@/components/b2b/DelinquencyTab";

export default function B2BCommercialCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [activeTab, setActiveTab] = useState('organizations');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getB2BCommercialCenter", {});
      setData(res?.data || res);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-[#FFFBF5]"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /></div>;
  }

  const metrics = data?.metrics || {};
  const orgs = data?.organizations || [];

  return (
    <div className="min-h-screen bg-[#FFFBF5] p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-serif text-[#1A1A1A]">B2B Commercial Center</h1>
          <p className="text-[#1A1A1A]/60 mt-1">Portfolio-level B2B business management</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard icon={DollarSign} label="B2B MRR" value={`$${(metrics.b2b_mrr || 0).toLocaleString()}`} />
          <MetricCard icon={TrendingUp} label="B2B ARR" value={`$${(metrics.b2b_arr || 0).toLocaleString()}`} />
          <MetricCard icon={Building2} label="Active Orgs" value={metrics.active_organizations || 0} />
          <MetricCard icon={AlertTriangle} label="Suspended" value={metrics.suspended_organizations || 0} />
          <MetricCard icon={DollarSign} label="Annual Prepaid" value={`$${(metrics.annual_prepaid_contracted || 0).toLocaleString()}`} />
          <MetricCard icon={DollarSign} label="Monthly Contracted" value={`$${(metrics.monthly_contracted || 0).toLocaleString()}`} />
          <MetricCard icon={DollarSign} label="Overage Revenue" value={`$${(metrics.total_overage_revenue || 0).toLocaleString()}`} />
          <MetricCard icon={Calendar} label="Upcoming Renewals" value={metrics.upcoming_renewals || 0} />
        </div>

        <div className="flex gap-2 mb-4">
          <TabButton active={activeTab === 'organizations'} onClick={() => setActiveTab('organizations')} icon={Building2} label="Organizations" />
          <TabButton active={activeTab === 'delinquency'} onClick={() => setActiveTab('delinquency')} icon={Shield} label="Delinquency" />
        </div>

        {activeTab === 'delinquency' ? (
          <DelinquencyTab />
        ) : (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#B8956A]/20">
            <h2 className="text-lg font-medium text-[#1A1A1A]">Organizations</h2>
          </div>
          <div className="divide-y divide-[#B8956A]/10">
            {orgs.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#1A1A1A]/40">No B2B organizations yet</div>
            ) : orgs.map((org) => (
              <button key={org.id} onClick={() => setSelectedOrg(org)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#B8956A]/5 transition-colors text-left">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${org.contract_status === 'active' ? 'bg-green-500' : org.contract_status === 'suspended' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div>
                    <p className="font-medium text-[#1A1A1A]">{org.display_name || org.legal_name}</p>
                    <p className="text-sm text-[#1A1A1A]/50">{org.plan_id} · {org.billing_frequency}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#1A1A1A]/30" />
              </button>
            ))}
          </div>
        </div>
        )}
      </div>

      {selectedOrg && <OrgDetailModal org={selectedOrg} onClose={() => setSelectedOrg(null)} />}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-[#B8956A]" />
        <p className="text-sm text-[#1A1A1A]/60">{label}</p>
      </div>
      <p className="text-xl font-semibold text-[#1A1A1A]">{value}</p>
    </div>
  );
}

function OrgDetailModal({ org, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-medium text-[#1A1A1A] mb-4">{org.display_name || org.legal_name}</h3>
        <div className="space-y-2 text-sm">
          <DetailRow label="Plan" value={org.plan_id} />
          <DetailRow label="Contract Type" value={org.contract_type} />
          <DetailRow label="Status" value={org.contract_status} />
          <DetailRow label="Billing" value={org.billing_frequency} />
          <DetailRow label="Admin" value={org.primary_admin_email} />
          <DetailRow label="Sales Rep" value={org.assigned_sales_rep_email} />
          <DetailRow label="Start Date" value={org.contract_start_date} />
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 rounded-lg bg-[#B8956A] text-white font-medium">Close</button>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#1A1A1A]/50">{label}</span>
      <span className="text-[#1A1A1A] font-medium">{value || '—'}</span>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-[#B8956A] text-white'
          : 'bg-white text-[#1A1A1A]/60 border border-[#B8956A]/20 hover:bg-[#B8956A]/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}