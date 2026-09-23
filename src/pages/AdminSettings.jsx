import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Settings } from "lucide-react";
import PayAtClosingSettingToggle from "@/components/admin/PayAtClosingSettingToggle";
import CustomerLifecyclePricingControl from "@/components/admin/CustomerLifecyclePricingControl";

export default function AdminSettings() {
  const [user, setUser] = useState(null);
  const [payAtClosingEnabled, setPayAtClosingEnabled] = useState(false);

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const salesMemberEmail = localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');
    const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
    const salesMemberRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');

    const checkPlatformAdmin = base44.auth.isAuthenticated()
      .then((isAuth) => isAuth ? base44.auth.me() : null)
      .then((me) => me?.role === 'admin')
      .catch(() => false);

    checkPlatformAdmin.then((platformIsAdmin) => {
      if (!salesMemberId && !platformIsAdmin) {
        window.location.href = '/SalesLogin';
        return;
      }
      if (salesMemberRole === 'admin' || platformIsAdmin) {
        setUser({
          id: salesMemberId,
          email: salesMemberEmail,
          full_name: salesMemberName,
          role: 'admin',
        });
      } else {
        base44.functions.invoke('getSalesDashboardData', { sales_member_id: salesMemberId }).then(res => {
          const data = res?.data || res;
          const member = data?.profile;
          if (member?.role === 'admin' || platformIsAdmin) {
            setUser({
              id: salesMemberId,
              email: salesMemberEmail,
              full_name: salesMemberName,
              role: 'admin',
            });
          } else {
            window.location.href = '/HubSpotActivityLog';
          }
        }).catch(() => {
          if (platformIsAdmin) {
            setUser({ id: salesMemberId, email: salesMemberEmail, full_name: salesMemberName, role: 'admin' });
          } else {
            window.location.href = '/SalesLogin';
          }
        });
      }
    });
  }, []);

  useEffect(() => {
    base44.entities.AppSetting.filter({ key: "pay_at_closing_enabled" })
      .then(rows => {
        if (rows && rows.length > 0) setPayAtClosingEnabled(rows[0].value === "true");
      })
      .catch(() => {});
  }, []);

  if (!user) {
    return <div className="p-6" style={{ backgroundColor: '#FFFBF5', minHeight: '100vh' }}>Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="w-8 h-8" style={{ color: '#B8956A' }} />
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>Admin Settings</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>
              Organization-wide configuration for booking and pricing.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: 'rgba(184,149,106,0.08)', border: '1px solid rgba(184,149,106,0.25)' }}>
            <Settings className="w-5 h-5 shrink-0" style={{ color: '#B8956A' }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Booking Options</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(26,26,26,0.6)' }}>Toggle pay-at-closing availability for clients.</p>
            </div>
            <PayAtClosingSettingToggle
              enabled={payAtClosingEnabled}
              onToggle={setPayAtClosingEnabled}
            />
          </div>

          <CustomerLifecyclePricingControl />
        </div>
      </div>
    </div>
  );
}