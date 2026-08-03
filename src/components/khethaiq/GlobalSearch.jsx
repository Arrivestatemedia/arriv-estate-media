import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, Briefcase } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.6)";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query.toLowerCase();
        const [empRes, candRes] = await Promise.all([
          base44.entities.SalesTeamMember.list("-created_date", 50),
          base44.entities.HireCandidate.list("-created_date", 100),
        ]);
        const employees = (empRes?.data ?? empRes ?? [])
          .filter(s => (s.full_name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q))
          .slice(0, 5);
        const candidates = (candRes?.data ?? candRes ?? [])
          .filter(c => (c.full_name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q))
          .slice(0, 5);
        setResults({ employees, candidates });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const total = (results?.employees?.length || 0) + (results?.candidates?.length || 0);

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(26,26,26,0.4)" }} />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search employees, candidates..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border text-sm focus:outline-none bg-white"
          style={{ borderColor: "rgba(184,149,106,0.15)" }}
        />
      </div>
      {open && results && total > 0 && (
        <div
          className="absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto z-50"
          style={{ borderColor: "rgba(184,149,106,0.15)" }}
        >
          {results.employees?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase px-3 pt-2 pb-1" style={{ color: "rgba(26,26,26,0.4)" }}>Employees</p>
              {results.employees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { navigate(createPageUrl("EmployeeProfile")); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-[#B8956A]/5 flex items-center gap-2"
                >
                  <User className="w-4 h-4" style={{ color: "rgba(26,26,26,0.4)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: TEXT_DARK }}>{emp.full_name}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{emp.title || emp.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {results.candidates?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase px-3 pt-2 pb-1" style={{ color: "rgba(26,26,26,0.4)" }}>Khetha IQ Candidates</p>
              {results.candidates.map(cand => (
                <button
                  key={cand.id}
                  onClick={() => { navigate(createPageUrl("KhethaIQ") + "?view=candidates"); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-[#B8956A]/5 flex items-center gap-2"
                >
                  <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: TEXT_DARK }}>{cand.full_name}</p>
                    <p className="text-xs" style={{ color: MUTED }}>{cand.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}