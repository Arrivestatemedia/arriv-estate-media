import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, X, Save, Video,
  HelpCircle, AlertTriangle, CheckCircle2, BookOpen, ArrowLeft, Copy
} from "lucide-react";
import { COMPETENCIES } from "@/lib/salesTrainingData";

const COMPETENCY_OPTIONS = COMPETENCIES;

export default function TrainingModuleManager() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingModule, setEditingModule] = useState(null);
  const [creating, setCreating] = useState(false);

  const loadModules = useCallback(async () => {
    try {
      const mods = await base44.entities.TrainingModule.list('order', 50);
      setModules(mods || []);
    } catch (err) {
      console.error("Failed to load modules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);

  const handleReorder = async (mod, direction) => {
    const sorted = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex(m => m.id === mod.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const newOrder = sorted[swapIdx].order;
    const swapNewOrder = mod.order;
    try {
      await Promise.all([
        base44.entities.TrainingModule.update(mod.id, { order: newOrder }),
        base44.entities.TrainingModule.update(sorted[swapIdx].id, { order: swapNewOrder }),
      ]);
      await loadModules();
    } catch (err) { console.error("Reorder failed:", err); }
  };

  const handleDelete = async (mod) => {
    if (!confirm(`Delete module "${mod.title}"? This cannot be undone.`)) return;
    try {
      await base44.entities.TrainingModule.delete(mod.id);
      await loadModules();
    } catch (err) { console.error("Delete failed:", err); }
  };

  const handleDuplicate = async (mod) => {
    try {
      const { id, created_date, updated_date, created_by_id, ...data } = mod;
      await base44.entities.TrainingModule.create({
        ...data,
        module_id: `${mod.module_id}_copy_${Date.now()}`,
        title: `${mod.title} (Copy)`,
        order: (modules.length + 1),
        active: false,
        version: 1,
      });
      await loadModules();
    } catch (err) { console.error("Duplicate failed:", err); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-[#B8956A] border-t-transparent rounded-full animate-spin" /></div>;
  }

  // ── Module Editor ──
  if (editingModule || creating) {
    return (
      <ModuleEditor
        module={editingModule}
        onCancel={() => { setEditingModule(null); setCreating(false); }}
        onSaved={() => { setEditingModule(null); setCreating(false); loadModules(); }}
      />
    );
  }

  const sorted = [...modules].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#1A1A1A' }}>Training Modules</h2>
          <p className="text-sm" style={{ color: 'rgba(26,26,26,0.5)' }}>{sorted.length} modules • Click edit to manage content, video, and quiz questions</p>
        </div>
        <Button className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
          onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> Add Module
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card><CardContent className="pt-8 pb-8 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: '#B8956A' }} />
          <p style={{ color: 'rgba(26,26,26,0.5)' }}>No modules yet. Click "Add Module" to create your first one.</p>
        </CardContent></Card>
      ) : (
        sorted.map((mod, idx) => (
          <Card key={mod.id} className="hover:shadow-md transition">
            <CardContent className="pt-5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.12)' }}>
                  <span className="text-sm font-bold" style={{ color: '#B8956A' }}>{mod.order || idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold" style={{ color: '#1A1A1A' }}>{mod.title}</h3>
                    {mod.active ? (
                      <Badge className="bg-[#B8956A] text-[#1A1A1A]">Published</Badge>
                    ) : (
                      <Badge className="bg-slate-200 text-slate-600">Draft</Badge>
                    )}
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'rgba(26,26,26,0.6)' }}>{mod.description || 'No description'}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>
                    <span className="flex items-center gap-1"><Video className="w-3 h-3" />{mod.video_url ? 'Video set' : 'No video'}</span>
                    <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3" />{(mod.quiz_questions || []).length} questions</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Pass: {mod.passing_score || 95}%</span>
                    {(mod.critical_question_indices || []).length > 0 && (
                      <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{(mod.critical_question_indices || []).length} critical</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleReorder(mod, 'up')} disabled={idx === 0}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleReorder(mod, 'down')} disabled={idx === sorted.length - 1}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingModule(mod)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDuplicate(mod)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(mod)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Module Editor (create/edit module + quiz builder) ─────────────────────
function ModuleEditor({ module, onCancel, onSaved }) {
  const isExisting = !!module?.id;
  const [formData, setFormData] = useState({
    module_id: module?.module_id || `mod_${Date.now()}`,
    title: module?.title || '',
    description: module?.description || '',
    order: module?.order || 1,
    video_url: module?.video_url || '',
    video_duration_seconds: module?.video_duration_seconds || 0,
    requires_watching: module?.requires_watching !== false,
    min_watch_percentage: module?.min_watch_percentage || 95,
    passing_score: module?.passing_score || 95,
    has_assignment: module?.has_assignment || false,
    assignment_description: module?.assignment_description || '',
    competency_tags: module?.competency_tags || [],
    prerequisites: module?.prerequisites || [],
    active: module?.active || false,
    quiz_questions: module?.quiz_questions || [],
    critical_question_indices: module?.critical_question_indices || [],
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setFormData(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!formData.title || !formData.module_id) {
      alert('Module ID and title are required.');
      return;
    }
    setSaving(true);
    try {
      // Recalculate critical question indices from is_critical flags
      const criticalIndices = formData.quiz_questions
        .map((q, i) => q.is_critical ? i : -1)
        .filter(i => i >= 0);

      const payload = { ...formData, critical_question_indices: criticalIndices, updated_at: new Date().toISOString() };

      if (isExisting) {
        await base44.entities.TrainingModule.update(module.id, payload);
      } else {
        await base44.entities.TrainingModule.create(payload);
      }
      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
      alert(err?.message || "Failed to save module.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onCancel} className="gap-2" style={{ color: '#B8956A' }}>
        <ArrowLeft className="w-4 h-4" /> Back to Modules
      </Button>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="text-lg font-bold" style={{ color: '#1A1A1A' }}>{isExisting ? 'Edit Module' : 'New Module'}</h2>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Module ID</Label>
              <Input value={formData.module_id} onChange={e => set('module_id', e.target.value)} disabled={isExisting}
                placeholder="mod_01_welcome" className="text-sm" />
            </div>
            <div>
              <Label>Order</Label>
              <Input type="number" value={formData.order} onChange={e => set('order', Number(e.target.value))} className="text-sm" />
            </div>
          </div>

          <div>
            <Label>Title</Label>
            <Input value={formData.title} onChange={e => set('title', e.target.value)} placeholder="Module title" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="What this module covers" />
          </div>

          {/* Video */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)' }}>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: '#1A1A1A' }}>
              <Video className="w-4 h-4" style={{ color: '#B8956A' }} /> Video Configuration
            </h3>
            <div className="space-y-3">
              <div>
                <Label>Video URL</Label>
                <Input value={formData.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://..." className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Duration (seconds)</Label>
                  <Input type="number" value={formData.video_duration_seconds} onChange={e => set('video_duration_seconds', Number(e.target.value))} className="text-sm" />
                </div>
                <div>
                  <Label>Min Watch %</Label>
                  <Input type="number" value={formData.min_watch_percentage} onChange={e => set('min_watch_percentage', Number(e.target.value))} className="text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formData.requires_watching} onChange={e => set('requires_watching', e.target.checked)} className="accent-[#B8956A]" />
                <span style={{ color: '#1A1A1A' }}>Require video watch completion before quiz</span>
              </label>
            </div>
          </div>

          {/* Quiz Builder */}
          <QuizBuilder
            questions={formData.quiz_questions}
            onChange={(qs) => set('quiz_questions', qs)}
            passingScore={formData.passing_score}
            onPassingScoreChange={(v) => set('passing_score', v)}
          />

          {/* Assignment */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)' }}>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={formData.has_assignment} onChange={e => set('has_assignment', e.target.checked)} className="accent-[#B8956A]" />
              <span className="font-semibold" style={{ color: '#1A1A1A' }}>This module has an assignment</span>
            </label>
            {formData.has_assignment && (
              <div>
                <Label>Assignment Description</Label>
                <Textarea value={formData.assignment_description} onChange={e => set('assignment_description', e.target.value)} rows={2}
                  placeholder="Describe the assignment (e.g. prospect research, CRM exercise, call preparation)" />
              </div>
            )}
          </div>

          {/* Competency Tags */}
          <div>
            <Label>Competency Tags</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COMPETENCY_OPTIONS.map(tag => (
                <label key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full cursor-pointer transition"
                  style={{
                    backgroundColor: formData.competency_tags.includes(tag) ? 'rgba(184,149,106,0.15)' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${formData.competency_tags.includes(tag) ? 'rgba(184,149,106,0.4)' : 'rgba(0,0,0,0.08)'}`,
                    color: formData.competency_tags.includes(tag) ? '#B8956A' : 'rgba(26,26,26,0.6)',
                  }}>
                  <input type="checkbox" checked={formData.competency_tags.includes(tag)}
                    onChange={e => {
                      if (e.target.checked) set('competency_tags', [...formData.competency_tags, tag]);
                      else set('competency_tags', formData.competency_tags.filter(t => t !== tag));
                    }} className="accent-[#B8956A] sr-only" />
                  {tag.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>

          {/* Publish */}
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: formData.active ? 'rgba(184,149,106,0.1)' : 'rgba(0,0,0,0.03)' }}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.active} onChange={e => set('active', e.target.checked)} className="accent-[#B8956A]" />
              <span className="font-medium" style={{ color: '#1A1A1A' }}>
                {formData.active ? 'Published (visible to reps)' : 'Draft (not visible to reps)'}
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave} className="gap-2" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Module'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Quiz Builder ─────────────────────────────────────────────────────────────
function QuizBuilder({ questions, onChange, passingScore, onPassingScoreChange }) {
  const [editingQ, setEditingQ] = useState(null);

  const addQuestion = () => {
    const newQ = {
      question_id: `Q${Date.now()}`,
      question: '',
      choices: ['', '', '', ''],
      correct_index: 0,
      explanation: '',
      competency: 'VALUE_CONNECTION',
      is_critical: false,
    };
    onChange([...questions, newQ]);
    setEditingQ(questions.length); // open editor for new question
  };

  const updateQuestion = (idx, updated) => {
    onChange(questions.map((q, i) => i === idx ? updated : q));
  };

  const deleteQuestion = (idx) => {
    if (!confirm('Delete this question?')) return;
    onChange(questions.filter((_, i) => i !== idx));
    setEditingQ(null);
  };

  const criticalCount = questions.filter((q, i) => q.is_critical).length;

  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(184,149,106,0.06)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#1A1A1A' }}>
          <HelpCircle className="w-4 h-4" style={{ color: '#B8956A' }} /> Quiz Questions
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Label className="text-xs">Pass %</Label>
            <Input type="number" value={passingScore} onChange={e => onPassingScoreChange(Number(e.target.value))} className="w-16 h-8 text-sm" />
          </div>
          <Button size="sm" onClick={addQuestion} className="gap-1" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
            <Plus className="w-3 h-3" /> Add Question
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 text-xs">
        <Badge className="bg-slate-200 text-slate-700">{questions.length} questions</Badge>
        <Badge className="bg-red-100 text-red-700">{criticalCount} critical</Badge>
        <span style={{ color: 'rgba(26,26,26,0.5)' }}>
          Critical questions must be answered correctly to pass, even if overall score is above threshold.
        </span>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-center py-4" style={{ color: 'rgba(26,26,26,0.4)' }}>No questions yet. Click "Add Question" to start building the quiz.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <QuestionCard
              key={idx}
              question={q}
              index={idx}
              isEditing={editingQ === idx}
              onEdit={() => setEditingQ(editingQ === idx ? null : idx)}
              onUpdate={(updated) => updateQuestion(idx, updated)}
              onDelete={() => deleteQuestion(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({ question, index, isEditing, onEdit, onUpdate, onDelete }) {
  const [local, setLocal] = useState(question);

  useEffect(() => { setLocal(question); }, [question]);

  const handleSave = () => {
    onUpdate(local);
    onEdit();
  };

  const setChoice = (ci, val) => {
    const choices = [...local.choices];
    choices[ci] = val;
    setLocal({ ...local, choices });
  };

  const addChoice = () => setLocal({ ...local, choices: [...local.choices, ''] });
  const removeChoice = (ci) => {
    if (local.choices.length <= 2) return;
    const choices = local.choices.filter((_, i) => i !== ci);
    let correct_index = local.correct_index;
    if (correct_index >= choices.length) correct_index = choices.length - 1;
    if (ci < correct_index) correct_index--;
    setLocal({ ...local, choices, correct_index });
  };

  if (!isEditing) {
    return (
      <div className="p-3 bg-white rounded-lg border" style={{ borderColor: 'rgba(184,149,106,0.15)' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold" style={{ color: '#B8956A' }}>Q{index + 1}</span>
              {local.is_critical && <Badge className="bg-red-100 text-red-700 text-xs">Critical</Badge>}
              <Badge variant="outline" className="text-xs">{local.competency?.replace(/_/g, ' ') || '—'}</Badge>
            </div>
            <p className="text-sm mt-1" style={{ color: '#1A1A1A' }}>{local.question || '(empty question)'}</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
              Correct: <span className="font-medium">{local.choices[local.correct_index] || '—'}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg border-2" style={{ borderColor: '#B8956A' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold" style={{ color: '#B8956A' }}>Question {index + 1}</span>
        <div className="flex gap-1">
          <Button size="sm" onClick={handleSave} className="gap-1" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
            <Save className="w-3 h-3" /> Done
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Question Text</Label>
          <Textarea value={local.question} onChange={e => setLocal({ ...local, question: e.target.value })} rows={2} placeholder="Enter the question..." />
        </div>

        <div>
          <Label className="text-xs">Answer Choices (select the correct one)</Label>
          <div className="space-y-2">
            {local.choices.map((choice, ci) => (
              <div key={ci} className="flex items-center gap-2">
                <input type="radio" checked={local.correct_index === ci} onChange={() => setLocal({ ...local, correct_index: ci })}
                  className="accent-[#B8956A]" />
                <Input value={choice} onChange={e => setChoice(ci, e.target.value)} placeholder={`Choice ${ci + 1}`} className="text-sm flex-1" />
                {local.choices.length > 2 && (
                  <Button size="sm" variant="ghost" onClick={() => removeChoice(ci)} className="text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {local.choices.length < 6 && (
            <Button size="sm" variant="ghost" onClick={addChoice} className="mt-1 text-xs gap-1" style={{ color: '#B8956A' }}>
              <Plus className="w-3 h-3" /> Add choice
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Competency</Label>
            <Select value={local.competency} onValueChange={v => setLocal({ ...local, competency: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPETENCY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" checked={local.is_critical} onChange={e => setLocal({ ...local, is_critical: e.target.checked })} className="accent-red-500" />
              <span style={{ color: '#1A1A1A' }}>Critical question</span>
            </label>
          </div>
        </div>

        <div>
          <Label className="text-xs">Explanation (shown after answering)</Label>
          <Textarea value={local.explanation} onChange={e => setLocal({ ...local, explanation: e.target.value })} rows={2} placeholder="Why is this the correct answer?" className="text-sm" />
        </div>
      </div>
    </div>
  );
}