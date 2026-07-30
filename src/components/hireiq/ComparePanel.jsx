import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, GitCompare } from "lucide-react";
import ComparisonTable from "@/components/hireiq/ComparisonTable";

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
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Job
      </button>

      <div className="flex items-center gap-3 mb-6">
        <GitCompare className="w-6 h-6 text-[#B8956A]" />
        <div>
          <h1 className="text-2xl font-bold">Compare Candidates</h1>
          <p className="text-sm text-gray-500">{job?.title}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-20">
          <GitCompare className="w-16 h-16 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No evaluated candidates to compare</p>
          <p className="text-sm text-gray-400 mt-1">Evaluate candidates first to enable side-by-side comparison.</p>
        </div>
      ) : (
        <ComparisonTable candidates={candidates} />
      )}
    </div>
  );
}