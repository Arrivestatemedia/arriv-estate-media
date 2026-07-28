import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, GraduationCap } from "lucide-react";

export default function OrientationTrainingQuiz({ module, salesMemberId, onDone }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (!module) return null;
  const questions = module.quiz || [];

  const select = (qi, idx) => setAnswers((a) => ({ ...a, [qi]: idx }));

  const submit = async () => {
    if (questions.length === 0) return;
    setSubmitting(true); setError("");
    try {
      const ordered = questions.map((_, i) => answers[i]);
      const res = await base44.functions.invoke("recordTrainingModuleScore", {
        sales_member_id: salesMemberId,
        module_id: module.id,
        answers: ordered,
      });
      if (res.data?.success) {
        setResult({ score: res.data.score, passed: res.data.passed });
        if (res.data.passed && onDone) onDone();
      } else setError(res.data?.error || "Could not submit quiz.");
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  if (module.complete && !result) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-600 py-1">
        <CheckCircle2 className="w-4 h-4" /> Completed{module.score != null ? ` — score ${module.score}%` : ""}
      </div>
    );
  }

  return (
    <div className="border border-[#B8956A]/20 rounded-lg p-3 space-y-3 bg-[#FFFBF5]/40">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#1A1A1A]"><GraduationCap className="w-4 h-4 text-[#B8956A]" /> {module.title}</div>
      {module.description && <p className="text-xs text-[#1A1A1A]/60">{module.description}</p>}
      {questions.length === 0 && <p className="text-xs text-[#1A1A1A]/60">No quiz for this module.</p>}
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-1">
          <p className="text-sm text-[#1A1A1A]">{qi + 1}. {q.question}</p>
          <div className="space-y-1">
            {(q.choices || []).map((c, ci) => {
              const selected = answers[qi] === ci;
              const showCorrect = result != null;
              const isCorrect = ci === q.correct_index;
              return (
                <button
                  key={ci}
                  type="button"
                  onClick={() => !result && select(qi, ci)}
                  className={`w-full text-left text-xs px-3 py-2 rounded-md border transition ${selected ? "border-[#B8956A] bg-[#B8956A]/10" : "border-[#B8956A]/20 bg-white hover:bg-[#FFFBF5]"} ${showCorrect && isCorrect ? "!border-green-500 !bg-green-50" : ""} ${showCorrect && selected && !isCorrect ? "!border-red-400 !bg-red-50" : ""}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {result && (
        <div className={`text-sm font-semibold flex items-center gap-2 ${result.passed ? "text-green-600" : "text-[#B8956A]"}`}>
          {result.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          Score: {result.score}% — {result.passed ? "Passed" : "Try again"}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!result && questions.length > 0 && (
        <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-white" disabled={submitting} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Submit Quiz
        </Button>
      )}
      {result && !result.passed && (
        <Button size="sm" variant="outline" onClick={() => { setResult(null); setAnswers({}); }}>Retake</Button>
      )}
    </div>
  );
}