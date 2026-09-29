import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CreditCard, Calendar, TrendingUp, Users, AlertCircle, Loader2, Building2 } from "lucide-react";

export default function B2BClientDashboard({ userEmail }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [userEmail]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getB2BClientDashboard", { email: userEmail });
      setData(res?.data || res);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  // If not B2B, render nothing (parent will show retail)
  if (data?.commercial_domain !== 'B2B' || !data?.b2b) {
    return null;
  }

  const b2b = data.b2b;
  const entitlement = b2b.entitlement;
  const org = b2b.organization;
  const currentPeriod = b2b.current_period;

  // Account hold check
  if (entitlement?.account_hold) {
    return <AccountHoldScreen org={org} entitlement={entitlement} />;
  }

  return (
    <div className="space-y-4">
      {/* Organization Header */}
      <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-5 h-5 text-[#B8956A]" />
          <div>
            <h2 className="text-lg font-medium text-[#1A1A1A]">{org?.display_name || org?.legal_name}</h2>
            <p className="text-sm text-[#1A1A1A]/50">{entitlement?.contract_type} · {entitlement?.billing_frequency}</p>
          </div>
        </div>
      </div>

      {/* Entitlement Summary */}
      {entitlement?.funding_mode === 'media_credit' && currentPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-[#B8956A]" />
            <h3 className="font-medium text-[#1A1A1A]">Media Credits</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <CreditDisplay label="Allocated" value={currentPeriod.credits_allocated} />
            <CreditDisplay label="Available" value={(currentPeriod.credits_available_units || 0) / 100} />
            <CreditDisplay label="Reserved" value={(currentPeriod.credits_reserved_units || 0) / 100} />
            <CreditDisplay label="Used" value={(currentPeriod.credits_consumed_units || 0) / 100} />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-[#1A1A1A]/50">
            <Calendar className="w-4 h-4" />
            Resets: {currentPeriod.period_end}
          </div>
        </div>
      )}

      {entitlement?.funding_mode === 'reserved_capacity' && currentPeriod && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-[#B8956A]" />
            <h3 className="font-medium text-[#1A1A1A]">Reserved Capacity</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <CreditDisplay label="Standard" value={currentPeriod.production_standard} raw />
            <CreditDisplay label="Contracted" value={`${currentPeriod.contracted_shoots} shoots`} raw />
            <CreditDisplay label="Available" value={`${currentPeriod.available_shoots || 0} shoots`} raw />
            <CreditDisplay label="Reserved" value={`${currentPeriod.reserved_shoots || 0} shoots`} raw />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-[#1A1A1A]/50">
            <Calendar className="w-4 h-4" />
            Resets: {currentPeriod.period_end}
          </div>
        </div>
      )}

      {/* Recent Bookings */}
      {b2b.recent_bookings && b2b.recent_bookings.length > 0 && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#B8956A]/20">
            <h3 className="text-sm font-medium text-[#1A1A1A]/60">Recent Bookings</h3>
          </div>
          <div className="divide-y divide-[#B8956A]/10">
            {b2b.recent_bookings.slice(0, 5).map(b => (
              <div key={b.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-[#1A1A1A]">{b.package}</p>
                  <p className="text-xs text-[#1A1A1A]/50">{b.street_address}, {b.city}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  b.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members */}
      {b2b.members && b2b.members.length > 0 && entitlement?.organization_role === 'admin' && (
        <div className="bg-white rounded-xl border border-[#B8956A]/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#B8956A]/20">
            <h3 className="text-sm font-medium text-[#1A1A1A]/60">Team</h3>
          </div>
          <div className="divide-y divide-[#B8956A]/10">
            {b2b.members.map((m, i) => (
              <div key={i} className="px-4 py-2 flex items-center justify-between text-sm">
                <span className="text-[#1A1A1A]">{m.name || m.email}</span>
                <span className="text-xs text-[#1A1A1A]/50">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreditDisplay({ label, value, raw }) {
  return (
    <div>
      <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      <p className="text-lg font-semibold text-[#1A1A1A]">{raw ? value : `${Number(value).toFixed(2)}`}</p>
    </div>
  );
}

function AccountHoldScreen({ org, entitlement }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-serif text-[#1A1A1A] mb-2">Account On Hold</h2>
        <p className="text-[#1A1A1A]/60 mb-6">
          Your account is currently on hold. Please contact your sales representative for assistance.
        </p>
        {org?.assigned_sales_rep_email && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-4 text-left">
            <p className="text-sm text-[#1A1A1A]/50">Sales Representative</p>
            <p className="font-medium text-[#1A1A1A]">{org.assigned_sales_rep_email}</p>
          </div>
        )}
      </div>
    </div>
  );
}