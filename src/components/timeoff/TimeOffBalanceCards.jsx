import React from "react";
import { Palmtree, HeartPulse, UserCircle, CalendarClock } from "lucide-react";

const LEAVE_CONFIG = {
  pto: { label: "PTO", icon: Palmtree, color: "#2563EB", bg: "#EFF6FF" },
  sick: { label: "Sick", icon: HeartPulse, color: "#059669", bg: "#ECFDF5" },
  personal: { label: "Personal", icon: UserCircle, color: "#7C3AED", bg: "#F5F3FF" },
};

export default function TimeOffBalanceCards({ balances, source }) {
  const pto = balances?.pto || {};
  const sick = balances?.sick || {};
  const personal = balances?.personal || {};
  const other = balances?.other || [];

  const fmt = (h) => `${Number(h || 0).toFixed(1)}h`;

  const cards = [
    { ...LEAVE_CONFIG.pto, balance: pto.balance_hours, used: pto.used_hours, next_accrual: pto.next_accrual_date, next_hours: pto.next_accrual_hours },
    { ...LEAVE_CONFIG.sick, balance: sick.balance_hours, used: sick.used_hours },
    { ...LEAVE_CONFIG.personal, balance: personal.balance_hours, used: personal.used_hours },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Leave Balances</h3>
        {source && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${source === "arriv_payroll" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
            {source === "arriv_payroll" ? "Synced with Arriv Payroll" : "Local (Payroll not configured)"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-xl border border-slate-200 p-4 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
                  <Icon className="w-4 h-4" style={{ color: c.color }} />
                </div>
                <span className="text-sm font-medium text-slate-700">{c.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{fmt(c.balance)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{fmt(c.used)} used</p>
              {c.next_accrual && (
                <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                  <CalendarClock className="w-3 h-3" />
                  +{fmt(c.next_hours)} on {new Date(c.next_accrual).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {other.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {other.map((o, i) => (
            <span key={i} className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
              {o.label}: <strong>{fmt(o.balance_hours)}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}