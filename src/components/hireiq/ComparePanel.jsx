import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, GitCompare } from "lucide-react";
import ComparisonTable from "@/components/hireiq/ComparisonTable";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.45)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: CREAM,
  border: "1px solid rgba(184,149,106,0.12)",
  borderRadius: "12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
};

export default function ComparePanel({ job, onBack }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!job?.id) { setLoading(false); return; }
    base44.entities.HireCandidate.filter({ job_id: job.id }, "-created_date", 100)
      .then(res => {
        const list = res?.data ?? res;
        setCandidates((Array.isArray(list) ? list : []).filter(c => c.evaluation));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [job?.id]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="p-5 mb-5" style={card}>
        <div className="flex items-center gap-3">
          <GitCompare className="w-6 h-6" style={{ color: GOLD }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Compare Candidates</h1>
            <p className="text-sm" style={{ color: MUTED_DARK }}>{job?.title}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED_LIGHT }} /></div>
      ) : candidates.length === 0 ? (
        <div className="p-10 text-center" style={card}>
          <GitCompare className="w-16 h-16 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium text-lg" style={{ color: TEXT_DARK }}>No evaluated candidates to compare</p>
          <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Evaluate candidates first to enable side-by-side comparison.</p>
        </div>
      ) : (
        <div className="p-5" style={card}>
          <ComparisonTable candidates={candidates} />
        </div>
      )}
    </div>
  );
}