import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Lock, CheckCircle2, PlayCircle, Award, Phone, PhoneOff, AlertTriangle, ChevronRight, Clock } from "lucide-react";
import { TRAINING_STATUS, CALLING_AUTH, CERTIFICATION_REQUIREMENTS } from "@/lib/salesTrainingData";

const getSalesMemberId = () => localStorage.getItem('sales_member_id') || sessionStorage.getItem('sales_member_id');
const getSalesMemberName = () => localStorage.getItem('sales_member_name') || sessionStorage.getItem('sales_member_name');
const getSalesMemberEmail = () => localStorage.getItem('sales_member_email') || sessionStorage.getItem('sales_member_email');

const STATUS_COLORS = {
  NOT_STARTED: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  REMEDIATION_REQUIRED: "bg-orange-100 text-orange-700",
  TRAINING_COMPLETE: "bg-teal-100 text-teal-700",
  AWAITING_CERTIFICATION: "bg-purple-100 text-purple-700",
  SALES_CERTIFIED: "bg-[#B8956A] text-[#1A1A1A]",
  CERTIFICATION_SUSPENDED: "bg-red-100 text-red-700",
  NOT_CERTIFIED: "bg-slate-300 text-slate-700",
};

const CALLING_AUTH_LABELS = {
  CALLING_LOCKED: { label: "Calling Locked", icon: PhoneOff, color: "text-red-600" },
  SUPERVISED_CALLING_ONLY: { label: "Supervised Calling Only", icon: Phone, color: "text-orange-600" },
  TRAINING_INDEPENDENT_CALLING_AUTHORIZED: { label: "Training-Independent Calling", icon: Phone, color: "text-blue-600" },
  INDEPENDENT_CALLING_AUTHORIZED: { label: "Independent Calling Authorized", icon: Phone, color: "text-green-600" },
};

export default function SalesTrainingContent() {
  const [memberId] = useState(getSalesMemberId());
  const [memberName] = useState(getSalesMemberName());
  const [memberEmail] = useState(getSalesMemberEmail());
  const [modules, setModules] = useState([]);
  const [certification, setCertification] = useState(null);
  const [progress, setProgress] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [selectedModule, setSelectedModule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');

  const loadData = useCallback(async () => {
    if (!memberId) return;
    try {
      const [mods, certs, prog, atts] = await Promise.all([
        base44.entities.TrainingModule.filter({ active: true, module_type: "sales_training" }, 'order', 50),
        base44.entities.SalesCertification.filter({ sales_member_id: memberId }),
        base44.entities.VideoWatchProgress.filter({ sales_member_id: memberId }),
        base44.entities.TrainingAttempt.filter({ sales_member_id: memberId }),
      ]);
      setModules(mods || []);
      setProgress(prog || []);
      setAttempts(atts || []);
      if (certs && certs.length > 0) {
        setCertification(certs[0]);
      } else {
        const created = await base44.entities.SalesCertification.create({
          sales_member_id: memberId,
          sales_member_name: memberName,
          sales_member_email: memberEmail,
          training_status: TRAINING_STATUS.NOT_STARTED,
          calling_authorization: CALLING_AUTH.CALLING_LOCKED,
          modules_total: 14,
        });
        setCertification(created);
      }
    } catch (err) {
      console.error("Failed to load training data:", err);
    } finally {
      setLoading(false);
    }
  }, [memberId, memberName, memberEmail]);

  useEffect(() => { loadData(); }, [loadData]);

  const getModuleProgress = (moduleId) => progress.find(p => p.module_id === moduleId);
  const getModuleAttempts = (moduleId) => attempts.filter(a => a.module_id === moduleId && a.attempt_type === "MODULE_QUIZ");
  const isModuleUnlocked = (mod, index) => {
    if (index === 0) return true;
    const prevMod = modules[index - 1];
    const prevProg = getModuleProgress(prevMod.module_id);
    const prevAttempts = getModuleAttempts(prevMod.module_id);
    const prevPassed = prevAttempts.some(a => a.passed);
    return prevProg?.completed && prevPassed;
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><div className="w-8 h-8 border-4 border-[#B8956A]/30 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  }

  if (!memberId) {
    return <Card className="p-6 text-center"><p className="text-slate-600">Please log in to access training.</p></Card>;
  }

  const cert = certification || {};
  const callingAuth = CALLING_AUTH_LABELS[cert.calling_authorization] || CALLING_AUTH_LABELS.CALLING_LOCKED;
  const CallingIcon = callingAuth.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-5 h-5 text-[#B8956A]" />
        <h2 className="text-lg font-semibold text-[#1A1A1A]">Arriv Estate Media Sales Certification</h2>
      </div>

      <Card className="p-4 bg-[#1A1A1A] border-[#B8956A]/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge className={STATUS_COLORS[cert.training_status] || STATUS_COLORS.NOT_STARTED}>
                {cert.training_status?.replace(/_/g, ' ') || 'NOT STARTED'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CallingIcon className={`w-4 h-4 ${callingAuth.color}`} />
              <span className="text-[#FFFBF5]/80">{callingAuth.label}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-[#B8956A]">{cert.modules_passed_count || 0}</p>
              <p className="text-xs text-[#FFFBF5]/60">Modules</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[#B8956A]">{cert.quiz_average_score ? Math.round(cert.quiz_average_score) : 0}%</p>
              <p className="text-xs text-[#FFFBF5]/60">Quiz Avg</p>
            </div>
            <div>
              <p className="text-xl font-bold text-[#B8956A]">{cert.final_exam_passed ? "✓" : "—"}</p>
              <p className="text-xs text-[#FFFBF5]/60">Final Exam</p>
            </div>
          </div>
        </div>
        {(cert.critical_failures || []).length > 0 && (
          <div className="mt-3 p-2 bg-red-500/10 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{cert.critical_failures.join(", ").replace(/_/g, " ")}</p>
          </div>
        )}
      </Card>

      {view === 'list' && (
        <div className="space-y-2">
          {modules.map((mod, index) => {
            const prog = getModuleProgress(mod.module_id);
            const modAttempts = getModuleAttempts(mod.module_id);
            const bestAttempt = modAttempts.length > 0 ? modAttempts.reduce((best, a) => a.score > best.score ? a : best) : null;
            const unlocked = isModuleUnlocked(mod, index);
            const watchComplete = prog?.completed;
            const quizPassed = bestAttempt?.passed;
            return (
              <Card key={mod.module_id} className={`p-3 ${!unlocked ? 'opacity-60' : ''} bg-white border-[#B8956A]/15 hover:border-[#B8956A]/40 transition-colors`}>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {quizPassed ? <CheckCircle2 className="w-7 h-7 text-[#B8956A]" /> :
                     unlocked ? <PlayCircle className="w-7 h-7 text-slate-400" /> :
                     <Lock className="w-7 h-7 text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-slate-400">Module {mod.order}</span>
                    <h3 className="font-semibold text-[#1A1A1A] truncate">{mod.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {watchComplete !== undefined && (
                        <Badge variant="outline" className="text-xs"><Clock className="w-3 h-3 mr-1" />{Math.round(prog.completion_percentage)}%</Badge>
                      )}
                      {bestAttempt && (
                        <Badge variant="outline" className={`text-xs ${bestAttempt.passed ? 'text-[#B8956A]' : 'text-red-600'}`}>
                          Quiz: {Math.round(bestAttempt.score)}% {bestAttempt.passed ? '✓' : '✗'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {unlocked && (
                    <Button size="sm" className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A] shrink-0"
                      onClick={() => { setSelectedModule(mod); setView('video'); }}>
                      {quizPassed ? "Review" : "Start"} <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === 'video' && selectedModule && (
        <VideoPlayer module={selectedModule} memberId={memberId} memberName={memberName} memberEmail={memberEmail}
          progress={getModuleProgress(selectedModule.module_id)}
          onWatchComplete={async () => { await loadData(); setView('quiz'); }}
          onBack={() => { setView('list'); setSelectedModule(null); }} />
      )}

      {view === 'quiz' && selectedModule && (
        <QuizInterface module={selectedModule} memberId={memberId} memberName={memberName} memberEmail={memberEmail}
          previousAttempts={getModuleAttempts(selectedModule.module_id)} certification={cert}
          onQuizComplete={async () => { await loadData(); setView('list'); setSelectedModule(null); }}
          onBack={() => setView('video')} />
      )}
    </div>
  );
}

function VideoPlayer({ module, memberId, memberName, memberEmail, progress, onWatchComplete, onBack }) {
  const videoRef = useRef(null);
  const watchedSegmentsRef = useRef([]);
  const lastTimeRef = useRef(0);
  const [completionPct, setCompletionPct] = useState(progress?.completion_percentage || 0);
  const [isComplete, setIsComplete] = useState(progress?.completed || false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (progress?.watch_segments) watchedSegmentsRef.current = progress.watch_segments;
  }, [progress]);

  const addWatchedSegment = (start, end) => {
    if (end <= start) return;
    const segs = watchedSegmentsRef.current;
    segs.push({ start, end });
    segs.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const seg of segs) {
      const last = merged[merged.length - 1];
      if (last && seg.start <= last.end) last.end = Math.max(last.end, seg.end);
      else merged.push({ ...seg });
    }
    watchedSegmentsRef.current = merged;
  };

  const calculateUniqueWatched = () => watchedSegmentsRef.current.reduce((sum, seg) => sum + (seg.end - seg.start), 0);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const current = video.currentTime;
    const last = lastTimeRef.current;
    if (current > last && current - last < 2) addWatchedSegment(last, current);
    lastTimeRef.current = current;
    const unique = calculateUniqueWatched();
    const pct = video.duration > 0 ? (unique / video.duration) * 100 : 0;
    setCompletionPct(Math.min(pct, 100));
  };

  const handleSeeked = () => { if (videoRef.current) lastTimeRef.current = videoRef.current.currentTime; };

  const handleEnded = async () => {
    const video = videoRef.current;
    if (!video) return;
    const unique = calculateUniqueWatched();
    const pct = video.duration > 0 ? (unique / video.duration) * 100 : 0;
    if (pct >= CERTIFICATION_REQUIREMENTS.min_watch_percentage) {
      setIsComplete(true);
      await saveProgress(true, pct);
      onWatchComplete();
    }
  };

  const saveProgress = async (completed, pct) => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const data = {
        sales_member_id: memberId, module_id: module.module_id,
        video_url: module.video_url || "",
        video_duration_seconds: videoRef.current?.duration || module.video_duration_seconds || 0,
        watched_seconds: calculateUniqueWatched(),
        completion_percentage: Math.round(pct * 10) / 10,
        completed, last_position_seconds: videoRef.current?.currentTime || 0,
        seeking_detected: false, watch_segments: watchedSegmentsRef.current,
        last_updated_at: now, completed_at: completed ? now : undefined,
      };
      if (progress?.id) await base44.entities.VideoWatchProgress.update(progress.id, data);
      else await base44.entities.VideoWatchProgress.create({ ...data, started_at: now });
    } catch (err) { console.error("Failed to save progress:", err); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack} className="text-slate-600">← Back to Modules</Button>
      <Card className="p-4 bg-white border-[#B8956A]/15">
        <h2 className="text-lg font-bold text-[#1A1A1A] mb-1">{module.title}</h2>
        <p className="text-sm text-slate-600 mb-3">{module.description}</p>
        {module.video_url ? (
          <video ref={videoRef} src={module.video_url} controls className="w-full rounded-lg bg-black"
            onTimeUpdate={handleTimeUpdate} onSeeked={handleSeeked} onEnded={handleEnded}
            style={{ maxHeight: '450px' }} />
        ) : (
          <div className="w-full h-48 bg-slate-100 rounded-lg flex items-center justify-center">
            <p className="text-slate-400 text-sm">Video not yet uploaded for this module</p>
          </div>
        )}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-600">Watch Progress</span>
            <span className="text-sm font-bold text-[#B8956A]">{Math.round(completionPct)}%</span>
          </div>
          <Progress value={completionPct} className="h-2" />
          <p className="text-xs text-slate-500 mt-1">Requires {CERTIFICATION_REQUIREMENTS.min_watch_percentage}% watch completion. Seeking to the end will not count.</p>
          {isComplete && (
            <Button className="mt-3 bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={onWatchComplete}>
              Continue to Quiz <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function QuizInterface({ module, memberId, memberName, memberEmail, previousAttempts, certification, onQuizComplete, onBack }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const questions = module.quiz_questions || [];

  const handleAnswer = (qIndex, choiceIndex) => setAnswers({ ...answers, [qIndex]: choiceIndex });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let correct = 0, criticalTotal = 0, criticalCorrect = 0;
      const answerSummary = [];
      questions.forEach((q, i) => {
        const selected = answers[i];
        const isCorrect = selected === q.correct_index;
        if (isCorrect) correct++;
        if (q.is_critical) { criticalTotal++; if (isCorrect) criticalCorrect++; }
        answerSummary.push({ question_id: q.question_id || `Q${i}`, selected_index: selected, correct: isCorrect, is_critical: q.is_critical || false, competency: q.competency || "" });
      });
      const total = questions.length;
      const score = total > 0 ? (correct / total) * 100 : 0;
      const allCriticalCorrect = criticalTotal === 0 || criticalCorrect === criticalTotal;
      const passed = allCriticalCorrect && score >= CERTIFICATION_REQUIREMENTS.module_quiz_min_score;
      const now = new Date().toISOString();
      const attempt = await base44.entities.TrainingAttempt.create({
        sales_member_id: memberId, sales_member_email: memberEmail,
        attempt_type: "MODULE_QUIZ", module_id: module.module_id, module_version: module.version || 1,
        product_truth_version: certification?.product_truth_version || "v1",
        score: Math.round(score * 10) / 10, passed, total_questions: total, correct_answers: correct,
        critical_questions_total: criticalTotal, critical_questions_correct: criticalCorrect,
        all_critical_correct: allCriticalCorrect, question_set_snapshot: questions,
        answer_summary: answerSummary, started_at: now, completed_at: now,
      });
      if (passed && certification?.id) {
        const completedModules = [...new Set([...(certification.modules_completed || []), module.module_id])];
        const allAttempts = [...(previousAttempts || []), attempt];
        const quizScores = allAttempts.filter(a => a.passed).map(a => a.score);
        const avgScore = quizScores.length > 0 ? quizScores.reduce((s, v) => s + v, 0) / quizScores.length : 0;
        const allCritical = allAttempts.every(a => a.all_critical_correct);
        await base44.entities.SalesCertification.update(certification.id, {
          modules_completed: completedModules, modules_passed_count: completedModules.length,
          quiz_average_score: Math.round(avgScore * 10) / 10,
          critical_questions_status: allCritical ? "ALL_CORRECT" : "HAS_FAILURES",
          training_status: completedModules.length >= 13 ? "TRAINING_COMPLETE" : "IN_PROGRESS",
        });
      }
      await base44.entities.AuditEvent.create({
        event_type: passed ? "QUIZ_PASSED" : "QUIZ_FAILED", sales_member_id: memberId, sales_member_name: memberName,
        actor_id: memberId, actor_name: memberName, actor_role: "REP",
        entity_type: "TrainingAttempt", entity_id: attempt.id,
        details: { module_id: module.module_id, score: Math.round(score * 10) / 10, passed }, timestamp: now,
      });
      setResult({ score: Math.round(score * 10) / 10, correct, total, passed, criticalTotal, criticalCorrect });
    } catch (err) { console.error("Quiz submission failed:", err); } finally { setSubmitting(false); }
  };

  if (result) {
    return (
      <div className="space-y-3">
        <Card className={`p-6 text-center ${result.passed ? 'bg-[#B8956A]/10' : 'bg-red-50'}`}>
          {result.passed ? <CheckCircle2 className="w-14 h-14 text-[#B8956A] mx-auto mb-3" /> : <AlertTriangle className="w-14 h-14 text-red-500 mx-auto mb-3" />}
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">{result.passed ? "Quiz Passed!" : "Quiz Not Passed"}</h2>
          <p className="text-slate-600 mb-2">Score: {result.score}% ({result.correct}/{result.total} correct)</p>
          {result.criticalTotal > 0 && <p className="text-sm text-slate-500 mb-3">Critical: {result.criticalCorrect}/{result.criticalTotal}</p>}
          {!result.passed && <p className="text-sm text-red-600 mb-3">{result.criticalCorrect < result.criticalTotal ? "All critical questions must be correct." : `Score must be ≥${CERTIFICATION_REQUIREMENTS.module_quiz_min_score}%.`}</p>}
          <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" onClick={onQuizComplete}>{result.passed ? "Continue" : "Back to Modules"}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button variant="ghost" onClick={onBack} className="text-slate-600">← Back to Video</Button>
      <Card className="p-4 bg-white border-[#B8956A]/15">
        <h2 className="text-lg font-bold text-[#1A1A1A] mb-1">{module.title} — Quiz</h2>
        <p className="text-xs text-slate-500 mb-4">Pass: {CERTIFICATION_REQUIREMENTS.module_quiz_min_score}% • All critical questions must be correct</p>
        <div className="space-y-4">
          {questions.map((q, qi) => (
            <div key={qi} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-slate-400 mt-0.5">{qi + 1}.</span>
                <div className="flex-1">
                  <p className="font-medium text-[#1A1A1A]">{q.question}</p>
                  {q.is_critical && <Badge className="mt-1 bg-red-100 text-red-700 text-xs">Critical</Badge>}
                </div>
              </div>
              <div className="space-y-1.5 ml-5">
                {q.choices.map((choice, ci) => (
                  <label key={ci} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${answers[qi] === ci ? 'border-[#B8956A] bg-[#B8956A]/5' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name={`q${qi}`} checked={answers[qi] === ci} onChange={() => handleAnswer(qi, ci)} className="accent-[#B8956A]" />
                    <span className="text-sm text-slate-700">{choice}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]" disabled={submitting || Object.keys(answers).length < questions.length} onClick={handleSubmit}>
            {submitting ? "Submitting..." : "Submit Quiz"}
          </Button>
        </div>
      </Card>
    </div>
  );
}