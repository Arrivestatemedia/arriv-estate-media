import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { analyzeInterview } from "@/lib/hireiq";

const EMPTY_Q = { question: "", competency: "", explanation: "", rating: 0, evidence: "", notes: "", confidence: "medium" };

export default function ScorecardEditor({ candidate, job, roleProfile, onComplete, onCancel }) {
  const [interviewer, setInterviewer] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [questions, setQuestions] = useState([{ ...EMPTY_Q }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateQ = (i, field, val) => {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q));
  };
  const addQ = () => setQuestions(prev => [...prev, { ...EMPTY_Q }]);
  const removeQ = (i) => setQuestions(prev => prev.filter((_, idx) => idx !== i));

  const handleComplete = async () => {
    setLoading(true);
    setError(null);
    try {
      const validQuestions = questions.filter(q => q.question.trim());
      if (validQuestions.length === 0) throw new Error("Add at least one question");
      const avgScore = validQuestions.reduce((s, q) => s + (q.rating || 0), 0) / validQuestions.length;

      const aiSummary = await analyzeInterview({ questions: validQuestions, interviewer, date }, job, roleProfile);

      await onComplete({
        interviewer_name: interviewer,
        interview_date: date,
        questions: validQuestions,
        ai_summary: aiSummary,
        overall_score: Math.round(avgScore * 20),
        status: "completed",
      });
    } catch (err) {
      setError(err.message || "Failed to complete interview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">Interviewer Name</label>
          <Input value={interviewer} onChange={e => setInterviewer(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Interview Date</label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex justify-between items-start">
              <span className="text-sm font-semibold text-gray-500">Question {i + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => removeQ(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              )}
            </div>
            <Input placeholder="Interview question" value={q.question} onChange={e => updateQ(i, "question", e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Competency being measured" value={q.competency} onChange={e => updateQ(i, "competency", e.target.value)} />
              <select className="border rounded px-2 py-2 text-sm" value={q.confidence} onChange={e => updateQ(i, "confidence", e.target.value)}>
                <option value="low">Low Confidence</option>
                <option value="medium">Medium Confidence</option>
                <option value="high">High Confidence</option>
              </select>
            </div>
            <Input placeholder="Explanation of what this question measures" value={q.explanation} onChange={e => updateQ(i, "explanation", e.target.value)} />
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Rating (1-5 rubric)</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => updateQ(i, "rating", n)}
                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                      q.rating === n ? "bg-[#B8956A] text-white" : "bg-white border text-gray-400 hover:bg-gray-100"
                    }`}>{n}</button>
                ))}
              </div>
            </div>
            <Textarea placeholder="Evidence (what the candidate said/did)" value={q.evidence} onChange={e => updateQ(i, "evidence", e.target.value)} rows={2} />
            <Textarea placeholder="Notes" value={q.notes} onChange={e => updateQ(i, "notes", e.target.value)} rows={1} />
          </div>
        ))}
        <Button variant="outline" onClick={addQ} className="w-full"><Plus className="w-4 h-4 mr-2" /> Add Question</Button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleComplete} disabled={loading} style={{ backgroundColor: "#B8956A" }}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing interview...</> : <><CheckCircle2 className="w-4 h-4 mr-2" /> Complete & Analyze</>}
        </Button>
      </div>
    </div>
  );
}