import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Scan, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { analyzeScorecardOCR } from "@/lib/hireiq";

const EMPTY_Q = { question: "", competency: "", explanation: "", rating: 0, evidence: "", notes: "", confidence: "medium" };

export default function OcrScorecardUpload({ candidate, job, roleProfile, onComplete, onCancel }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [interviewer, setInterviewer] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState(null);

  const handleExtract = async () => {
    if (!file) { setError("Please upload a scanned scorecard"); return; }
    setLoading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await analyzeScorecardOCR(file_url, job, roleProfile);
      setExtracted(result);
      setQuestions((result.questions || []).map(q => ({ ...EMPTY_Q, ...q, rating: q.rating || 0 })));
      if (result.interviewer_name) setInterviewer(result.interviewer_name);
      if (result.interview_date) setDate(result.interview_date);
    } catch (err) {
      setError("Failed to extract scorecard: " + (err.message || "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const updateQ = (i, field, val) => {
    setQuestions(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: val } : q));
  };

  const handleSave = async () => {
    const validQuestions = questions.filter(q => q.question.trim());
    if (validQuestions.length === 0) { setError("No valid questions extracted"); return; }
    const avgScore = validQuestions.reduce((s, q) => s + (q.rating || 0), 0) / validQuestions.length;
    await onComplete({
      interviewer_name: interviewer,
      interview_date: date,
      questions: validQuestions,
      overall_score: Math.round(avgScore * 20),
      status: "completed",
      interview_type: "ocr",
    });
  };

  return (
    <div className="space-y-4">
      {!extracted && (
        <>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input type="file" accept="image/*,.pdf" onChange={e => setFile(e.target.files[0])} className="hidden" id="ocr-scorecard" />
            <label htmlFor="ocr-scorecard" className="cursor-pointer">
              <Scan className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">{file ? file.name : "Upload a scanned or photographed scorecard (image or PDF)"}</p>
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleExtract} disabled={loading} style={{ backgroundColor: "#B8956A" }}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting...</> : <><Scan className="w-4 h-4 mr-2" /> Extract Scorecard</>}
            </Button>
          </div>
        </>
      )}

      {extracted && (
        <>
          {extracted.extraction_notes && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm text-blue-700">
              <p className="font-semibold">Extraction Notes</p>
              <p className="text-xs">{extracted.extraction_notes}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Interviewer</label>
              <Input value={interviewer} onChange={e => setInterviewer(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-gray-500">Review and edit the extracted scorecard below before saving.</p>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <span className="text-sm font-semibold text-gray-500">Question {i + 1}</span>
                <Input placeholder="Question" value={q.question} onChange={e => updateQ(i, "question", e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Competency" value={q.competency} onChange={e => updateQ(i, "competency", e.target.value)} />
                  <select className="border rounded px-2 py-2 text-sm" value={q.confidence} onChange={e => updateQ(i, "confidence", e.target.value)}>
                    <option value="low">Low Confidence</option>
                    <option value="medium">Medium Confidence</option>
                    <option value="high">High Confidence</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Rating (1-5)</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => updateQ(i, "rating", n)} className={`w-9 h-9 rounded-lg text-sm font-bold ${q.rating === n ? "bg-[#B8956A] text-white" : "bg-white border text-gray-400"}`}>{n}</button>
                    ))}
                  </div>
                </div>
                <Textarea placeholder="Evidence" value={q.evidence} onChange={e => updateQ(i, "evidence", e.target.value)} rows={2} />
                <Textarea placeholder="Notes" value={q.notes} onChange={e => updateQ(i, "notes", e.target.value)} rows={1} />
              </div>
            ))}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setExtracted(null); setQuestions([]); }}><X className="w-4 h-4 mr-1" /> Re-upload</Button>
            <Button onClick={handleSave} style={{ backgroundColor: "#B8956A" }}><Check className="w-4 h-4 mr-1" /> Save Scorecard</Button>
          </div>
        </>
      )}
    </div>
  );
}