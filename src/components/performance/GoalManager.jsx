import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Target } from "lucide-react";
import { METRIC_LABELS } from "./metrics";

const PERIODS = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const METRICS = Object.keys(METRIC_LABELS);

export default function GoalManager() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ metric: "calls", period: "daily", target: "", assignee_id: "" });

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageGoals", { action: "list" });
      setGoals(res.data.goals || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    try {
      await base44.functions.invoke("manageGoals", { action: "create", ...form, target: Number(form.target) });
      setForm({ metric: "calls", period: "daily", target: "", assignee_id: "" });
      setShowForm(false);
      load();
    } catch (e) { console.error(e); }
  }

  async function remove(id) {
    try { await base44.functions.invoke("manageGoals", { action: "delete", id }); load(); }
    catch (e) { console.error(e); }
  }

  return (
    <div className="bg-white border border-[#2563EB]/15 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Target className="w-5 h-5 text-[#2563EB]" /> Goals
        </h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)} className="bg-[#2563EB]">
          <Plus className="w-4 h-4" /> New Goal
        </Button>
      </div>
      {showForm && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 p-3 bg-slate-50 rounded-lg">
          <Select value={form.metric} onValueChange={(v) => setForm({ ...form, metric: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{METRICS.map((m) => <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={form.period} onValueChange={(v) => setForm({ ...form, period: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          <Button onClick={create} className="bg-[#2563EB]">Save</Button>
        </div>
      )}
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Loading...</p>}
        {goals.map((g) => (
          <div key={g.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700">{METRIC_LABELS[g.metric] || g.metric}</span>
              <span className="text-xs text-slate-400 capitalize">{g.period}</span>
              <span className="text-sm font-bold text-[#2563EB]">{g.target}</span>
              {g.assignee_name && <span className="text-xs text-slate-400">· {g.assignee_name}</span>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(g.id)} className="text-red-500">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {!loading && goals.length === 0 && <p className="text-sm text-slate-400">No goals yet. Create one to start tracking.</p>}
      </div>
    </div>
  );
}