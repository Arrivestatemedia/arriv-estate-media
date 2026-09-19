// FILE: src/components/simulation/PracticalScoreModal.jsx
// Copy this entire file into Arriv One at the same path.

import React, { useState } from "react";
import { X, Save } from "lucide-react";
import { ALL_RUBRICS, CRITICAL_FAILURES } from "@/lib/certificationRubrics";

export default function PracticalScoreModal({ open, onClose, practicalType, learnerName, onSubmit }) {
  const [scores, setScores] = useState({});
  const [selectedFailures, setSelectedFailures] = useState([]);
  const [notes, setNotes] = useState("");

  if (!open || !practicalType) return null;

  const config = ALL_RUBRICS[practicalType];
  if (!config) return null;
  const rubric = config.rubric;

  const totalScore = Object.values(scores).reduce((sum, s) => sum + (Number(s) || 0), 0);
  const passed = totalScore >= rubric.passing_score && selectedFailures.length === 0;

  const handleScoreChange = (key, value) => {
    const num = Math.min(Math.max(Number(value) || 0, 0), rubric.categories.find(c => c.key === key)?.points || 0);
    setScores({ ...scores, [key]: num });
  };

  const toggleFailure = (key) => {
    setSelectedFailures(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSubmit = () => {
    onSubmit({ practical_type: practicalType, score: totalScore, critical_failures: selectedFailures, notes });
    setScores({}); setSelectedFailures([]); setNotes(""); onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-serif text-[#1A1A1A]">{config.label} Score</h2>
            <p className="text-sm text-[#1A1A1A]/60">{learnerName} · Passing: {rubric.passing_score}/100</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#1A1A1A]/5"><X className="w-5 h-5 text-[#1A1A1A]/40" /></button>
        </div>
        <div className="space-y-3 mb-4">
          {rubric.categories.map(cat => (
            <div key={cat.key} className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-[#1A1A1A]">{cat.label}</label>
                <p className="text-xs text-[#1A1A1A]/40">Max: {cat.points} pts</p>
              </div>
              <input type="number" min="0" max={cat.points} value={scores[cat.key] || ""} onChange={e => handleScoreChange(cat.key, e.target.value)} className="w-20 px-2 py-1.5 text-sm border border-[#B8956A]/30 rounded-lg text-center focus:outline-none focus:border-[#B8956A]" placeholder="0" />
            </div>
          ))}
        </div>
        <div className={`p-3 rounded-lg mb-4 ${passed ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total Score</span>
            <span className={`text-lg font-bold ${passed ? "text-emerald-600" : "text-red-600"}`}>{totalScore}/100 {passed ? "✓ PASSED" : "✗ FAILED"}</span>
          </div>
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium text-[#1A1A1A] mb-2 block">Critical Failures (optional — auto-fails the practical)</label>
          <div className="space-y-1 max-h-40 overflow-y-auto border border-[#B8956A]/20 rounded-lg p-2">
            {CRITICAL_FAILURES.map(cf => (
              <label key={cf.key} className="flex items-start gap-2 p-1.5 rounded hover:bg-[#1A1A1A]/5 cursor-pointer">
                <input type="checkbox" checked={selectedFailures.includes(cf.key)} onChange={() => toggleFailure(cf.key)} className="mt-0.5" />
                <span className="text-xs text-[#1A1A1A]/70">{cf.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium text-[#1A1A1A] mb-1 block">Evaluator Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-[#B8956A]/30 rounded-lg focus:outline-none focus:border-[#B8956A]" placeholder="Coaching feedback for the learner..." />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-[#1A1A1A]/60 hover:bg-[#1A1A1A]/5">Cancel</button>
          <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B8956A] text-white text-sm font-medium hover:bg-[#A68559]">
            <Save className="w-4 h-4" /> Record Score
          </button>
        </div>
      </div>
    </div>
  );
}