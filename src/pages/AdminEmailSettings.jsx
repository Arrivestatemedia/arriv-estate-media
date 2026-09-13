import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Mail } from "lucide-react";
import EmailProviderSettings from "@/components/admin/EmailProviderSettings";

export default function AdminEmailSettings() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const salesMemberId = localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
    const salesMemberName = localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
    const salesMemberRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');

    if (!salesMemberId) {
      window.location.href = '/SalesLogin';
      return;
    }

    base44.auth.isAuthenticated().then((isAuth) => {
      if (isAuth) {
        base44.auth.me().then((me) => {
          if (me?.role === 'admin' || salesMemberRole === 'admin') {
            setUser({ id: salesMemberId, full_name: salesMemberName, role: 'admin' });
          } else {
            window.location.href = '/HubSpotActivityLog';
          }
        }).catch(() => {
          if (salesMemberRole === 'admin') {
            setUser({ id: salesMemberId, full_name: salesMemberName, role: 'admin' });
          } else {
            window.location.href = '/SalesLogin';
          }
        });
      } else {
        if (salesMemberRole === 'admin') {
          setUser({ id: salesMemberId, full_name: salesMemberName, role: 'admin' });
        } else {
          window.location.href = '/SalesLogin';
        }
      }
    }).catch(() => {
      if (salesMemberRole === 'admin') {
        setUser({ id: salesMemberId, full_name: salesMemberName, role: 'admin' });
      } else {
        window.location.href = '/SalesLogin';
      }
    });
  }, []);

  if (!user) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: '#FFFBF5' }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
            <Mail className="w-6 h-6" style={{ color: '#B8956A' }} />
          </div>
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>Email Settings</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>Configure inbound email forwarding and provider settings.</p>
          </div>
        </div>
        <div className="p-6 rounded-xl" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(184,149,106,0.25)' }}>
          <EmailProviderSettings />
        </div>
      </div>
    </div>
  );
}