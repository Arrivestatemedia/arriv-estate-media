import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, TrendingUp, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function PerformanceTracker({ candidate, job, onSaved }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    hire_date: new Date().toISOString().split("T")[0],
    performance_rating: 3,
    goal_completion: 0,
    retention_months: 0,
    promoted: false,
    training_completion: 0,
    attendance_rating: 3,
    manager_evaluation: "",
    customer_satisfaction: 0,
    sales_performance: 0,
    notes: "",
  });

  const loadRecords = async () => {
    try {
      const res = await base44.entities.HirePerformance.filter({ candidate_id: candidate.id }, "-created_date", 20);
      const list = res?.data ?? res;
      setRecords(Array.isArray(list) ? list : []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, [candidate.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await base44.entities.HirePerformance.create({
        ...form,
        candidate_id: candidate.id,
        job_id: candidate.job_id,
        candidate_name: candidate.name,
        job_title: job?.title,
        recorded_at: new Date().toISOString(),
      });
      const record = res?.data ?? res;
      setRecords(prev => [record, ...prev]);
      setForm(prev => ({ ...prev, notes: "" }));
      if (onSaved) onSaved(record);
    } catch (_) {}
    setSaving(false);
  };

  const numInput = (label, field, max) => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <Input type="number" min="0" max={max} value={form[field]} onChange={e => setForm(prev => ({ ...prev, [field]: Number(e.target.value) }))} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Hire Date</label>
          <Input type="date" value={form.hire_date} onChange={e => setForm(prev => ({ ...prev, hire_date: e.target.value }))} />
        </div>
        {numInput("Performance (1-5)", "performance_rating", 5)}
        {numInput("Goal Completion %", "goal_completion", 100)}
        {numInput("Retention (months)", "retention_months")}
        {numInput("Training %", "training_completion", 100)}
        {numInput("Attendance (1-5)", "attendance_rating", 5)}
        {numInput("Customer Sat (0-100)", "customer_satisfaction", 100)}
        {numInput("Sales Performance", "sales_performance")}
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.promoted} onChange={e => setForm(prev => ({ ...prev, promoted: e.target.checked }))} />
            Promoted
          </label>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Manager Evaluation</label>
        <Textarea value={form.manager_evaluation} onChange={e => setForm(prev => ({ ...prev, manager_evaluation: e.target.value }))} rows={2} />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Notes</label>
        <Textarea value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} rows={2} />
      </div>
      <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#B8956A" }}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Record Performance
      </Button>

      {loading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : records.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Performance History</p>
          {records.map(r => (
            <div key={r.id} className="border rounded p-2 text-sm bg-gray-50">
              <div className="flex justify-between">
                <span className="font-medium">{new Date(r.recorded_at || r.created_date).toLocaleDateString()}</span>
                <span className="text-xs text-gray-500">Perf: {r.performance_rating}/5 · Goals: {r.goal_completion}% · Retention: {r.retention_months}mo</span>
              </div>
              {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}