import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, GitCompare } from "lucide-react";
import ComparisonTable from "@/components/hireiq/ComparisonTable";

const LIGHT_TEXT = "#e3dfd9";
const MUTED = "#8a9a98";
const GOLD = "#B8956A";
const CREAM = "#f3efe9";
const DARK_BORDER = "#1a2021";
const DARK_TEXT = "#2a3536";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const stackedCard = {
  backgroundColor: CREAM,
  border: `2px solid ${DARK_BORDER}`,
  borderRadius: "10px",
  boxShadow: `3px 3px 0 ${DARK_BORDER}, 6px 8px 20px rgba(0,0,0,0.35)`,
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
      <div className="p-5 mb-5" style={stackedCard}>
        <div className="flex items-center gap-3">
          <GitCompare className="w-6 h-6" style={{ color: GOLD }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: DARK_TEXT }}>Compare Candidates</h1>
            <p className="text-sm" style={{ color: "#6b7c7a" }}>{job?.title}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: MUTED }} /></div>
      ) : candidates.length === 0 ? (
        <div className="p-10 text-center" style={stackedCard}>
          <GitCompare className="w-16 h-16 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-lg" style={{ color: DARK_TEXT }}>No evaluated candidates to compare</p>
          <p className="text-sm mt-1" style={{ color: "#6b7c7a" }}>Evaluate candidates first to enable side-by-side comparison.</p>
        </div>
      ) : (
        <div className="p-5" style={stackedCard}>
          <ComparisonTable candidates={candidates} />
        </div>
      )}
    </div>
  );
}