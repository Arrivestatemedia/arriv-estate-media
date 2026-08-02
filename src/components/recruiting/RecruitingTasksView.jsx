import React, { useState, useEffect } from "react";
import { listTasks, completeTask, createTask } from "@/lib/recruitingApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, Plus, X, ListChecks } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const STATUS_TABS = ["pending", "in_progress", "completed"];

export default function RecruitingTasksView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "follow_up", title: "", due_date: "", priority: "medium" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await listTasks({ status: tab });
      setTasks(data.tasks || []);
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const handleComplete = async (id) => {
    await completeTask(id); load();
  };

  const handleCreate = async () => {
    if (!form.title) return;
    try {
      await createTask({ type: form.type, title: form.title, due_date: form.due_date || null, priority: form.priority });
      setForm({ type: "follow_up", title: "", due_date: "", priority: "medium" });
      setShowForm(false); load();
    } catch (e) { alert("Failed: " + e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Recruiting Tasks</h2>
        <Button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <Plus className="w-4 h-4 mr-2" /> New Task
        </Button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Type</Label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full p-2 rounded-lg text-sm border bg-white" style={{ borderColor: "rgba(184,149,106,0.2)", color: TEXT_DARK }}>
                <option value="follow_up">Follow Up</option>
                <option value="outreach">Outreach</option>
                <option value="review_prospect">Review Prospect</option>
                <option value="schedule_call">Schedule Call</option>
                <option value="send_message">Send Message</option>
                <option value="general">General</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-white" />
            </div>
            <div>
              <Label className="block text-xs font-medium mb-1" style={{ color: TEXT_DARK }}>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="bg-white" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleCreate} size="sm" style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>Create</Button>
            <Button onClick={() => setShowForm(false)} size="sm" variant="outline">Cancel</Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {STATUS_TABS.map((s) => (
          <button key={s} onClick={() => setTab(s)}
            className="text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors"
            style={{ backgroundColor: tab === s ? GOLD : "rgba(26,26,26,0.05)", color: tab === s ? "#1A1A1A" : MUTED, border: "1px solid rgba(184,149,106,0.2)" }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20">
          <ListChecks className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium" style={{ color: TEXT_DARK }}>No {tab} tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "#FFFBF5" }}>{t.title || t.type}</p>
                <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "rgba(255,251,245,0.4)" }}>
                  <span className="capitalize">{t.type}</span>
                  {t.due_date && <span>Due: {t.due_date}</span>}
                  {t.prospect_name && <span>{t.prospect_name}</span>}
                  <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>{t.priority}</span>
                </div>
              </div>
              {t.status !== "completed" && (
                <Button size="sm" variant="ghost" onClick={() => handleComplete(t.id)} className="text-[#B8956A]">
                  <Check className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}