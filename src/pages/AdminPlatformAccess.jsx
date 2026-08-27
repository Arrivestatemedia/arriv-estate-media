import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Check, X, Landmark, Brain, Briefcase } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";

export default function AdminPlatformAccess() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const salesRole = localStorage.getItem('sales_member_role') || sessionStorage.getItem('sales_member_role');
    const userRole = localStorage.getItem('user_role') || sessionStorage.getItem('user_role');
    if (salesRole !== 'admin' && userRole !== 'admin') {
      window.location.href = '/AdminHub';
      return;
    }
    base44.entities.SalesTeamMember.list("-created_date", 200)
      .then(res => {
        const list = res?.data ?? res;
        setMembers(Array.isArray(list) ? list : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasArrivOne = (m) => !!m.arriv_employee_id;
  const hasPayroll = (m) => m.payroll_sync_status === 'synced' || !!m.payroll_employee_id;
  const hasKhethaIQ = (m) => m.role === 'admin' && m.is_active !== false;

  const PlatformBadge = ({ active, label, icon: Icon }) => (
    <div className="flex items-center gap-1.5">
      {active ? (
        <Badge className="bg-[#B8956A] text-[#1A1A1A] gap-1">
          <Check className="w-3 h-3" /> {label}
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1 opacity-40">
          <X className="w-3 h-3" /> {label}
        </Badge>
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ backgroundColor: CREAM }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-1" style={{ color: TEXT_DARK }}>
          <span style={{ fontStyle: 'italic' }}>Arriv</span> Platform Access
        </h1>
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Company-wide overview of platform provisioning
        </p>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-6 p-4 rounded-xl" style={{ backgroundColor: '#fff', border: '1px solid rgba(184,149,106,0.2)' }}>
          <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_DARK }}>
            <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
            <span className="font-medium">Arriv One</span>
            <span style={{ color: MUTED }}>(CRM)</span>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_DARK }}>
            <Landmark className="w-4 h-4" style={{ color: GOLD }} />
            <span className="font-medium">Arriv Payroll</span>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_DARK }}>
            <Brain className="w-4 h-4" style={{ color: GOLD }} />
            <span className="font-medium">Khetha IQ</span>
            <span style={{ color: MUTED }}>(Hiring)</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16 rounded-xl" style={{ backgroundColor: '#fff', border: '1px solid rgba(184,149,106,0.2)' }}>
            <Users className="w-12 h-12 mx-auto mb-3" style={{ color: 'rgba(184,149,106,0.3)' }} />
            <p style={{ color: TEXT_DARK }}>No team members found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map(m => (
              <div
                key={m.id}
                className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                style={{ backgroundColor: '#fff', border: '1px solid rgba(184,149,106,0.2)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: GOLD }}
                  >
                    {(m.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: TEXT_DARK }}>
                      {m.full_name || 'Unknown'}
                      {m.is_active === false && (
                        <Badge variant="outline" className="ml-2 text-xs opacity-60">Inactive</Badge>
                      )}
                    </p>
                    <p className="text-sm" style={{ color: MUTED }}>{m.email}</p>
                    <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {m.title || 'Sales Representative'} · {m.role === 'admin' ? 'Admin' : 'Rep'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformBadge active={hasArrivOne(m)} label="Arriv One" />
                  <PlatformBadge active={hasPayroll(m)} label="Payroll" />
                  <PlatformBadge active={hasKhethaIQ(m)} label="Khetha IQ" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}