import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const LEAVE_COLORS = {
  pto: "#2563EB", sick: "#059669", personal: "#7C3AED", unpaid: "#DC2626",
  bereavement: "#6B7280", jury_duty: "#D97706", other: "#6B7280",
};

export default function TimeOffCalendar({ approved = [] }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const offByDate = useMemo(() => {
    const map = {};
    for (const r of approved) {
      const s = new Date(r.start_date + "T00:00:00");
      const e = new Date(r.end_date + "T00:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(r);
      }
    }
    return map;
  }, [approved]);

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = new Date(year, month, day).toISOString().slice(0, 10);
    cells.push({ day, dateStr, off: offByDate[dateStr] || [] });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Team Time-Off Calendar</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset(monthOffset - 1)} className="p-1.5 rounded-lg hover:bg-slate-100">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">
            {baseDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setMonthOffset(monthOffset + 1)} className="p-1.5 rounded-lg hover:bg-slate-100">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isToday = cell.dateStr === today;
          return (
            <div key={i} className={`min-h-[48px] rounded-lg border p-1 text-xs ${isToday ? "border-[#2563EB] bg-blue-50" : "border-slate-200 bg-white"}`}>
              <span className={`block ${isToday ? "font-bold text-[#2563EB]" : "text-slate-500"}`}>{cell.day}</span>
              {cell.off.map((r, idx) => (
                <div key={idx} className="mt-0.5 px-1 py-0.5 rounded text-[10px] text-white truncate" style={{ background: LEAVE_COLORS[r.leave_type] || "#6B7280" }} title={`${r.employee_name} — ${r.leave_type}`}>
                  {r.employee_name?.split(" ")[0]}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}