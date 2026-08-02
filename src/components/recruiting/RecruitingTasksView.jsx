import React, { useState, useEffect } from "react";
import { Plus, Trash2, CheckSquare, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listTasks, createTask, updateTask, deleteTask } from "@/lib/recruitingApi";
import { toast } from "sonner";

const TASK_TYPES = ["follow_up", "outreach", "review", "schedule_interview", "other"];

export default function RecruitingTasksView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: "follow_up",
    due_date: "",
    prospect_name: "",
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await listTasks({ limit: 100 });
      setTasks(res.tasks || []);
    } catch (e) {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async () => {
    try {
      await createTask(form);
      toast.success("Task created");
      setForm({ type: "follow_up", due_date: "", prospect_name: "", notes: "" });
      setShowForm(false);
      load();
    } catch (e) {
      toast.error("Failed to create task");
    }
  };

  const handleToggleStatus = async (task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await updateTask(task.id, { status: newStatus });
      load();
    } catch (e) {
      toast.error("Failed to update task");
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteTask(id);
      toast.success("Task deleted");
      load();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const pending = tasks.filter((t) => t.status !== "completed");
  const completed = tasks.filter((t) => t.status === "completed");

  const renderTask = (t) => (
    <div key={t.id} className="bg-white rounded-xl border border-[#B8956A]/20 p-4 flex items-start gap-3">
      <button
        onClick={() => handleToggleStatus(t)}
        className={`w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
          t.status === "completed"
            ? "bg-[#B8956A] border-[#B8956A]"
            : "border-[#B8956A]/30 hover:border-[#B8956A]"
        }`}
      >
        {t.status === "completed" && <CheckSquare className="w-3 h-3 text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-xs bg-[#FFFBF5] text-[#1A1A1A]/70 border border-[#B8956A]/15 capitalize">
            {t.type.replace(/_/g, " ")}
          </span>
          {t.due_date && (
            <span className="flex items-center gap-1 text-xs text-[#1A1A1A]/50">
              <Calendar className="w-3 h-3" />
              {t.due_date}
            </span>
          )}
        </div>
        {t.prospect_name && (
          <p className="text-sm font-medium text-[#1A1A1A] mt-1.5 flex items-center gap-1">
            <User className="w-3 h-3 text-[#B8956A]" />
            {t.prospect_name}
          </p>
        )}
        {t.notes && <p className="text-sm text-[#1A1A1A]/60 mt-1">{t.notes}</p>}
      </div>
      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)} className="text-red-500 hover:bg-red-50 shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5]">
      <div className="sticky top-0 bg-white border-b border-[#B8956A]/20 px-6 py-4 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Recruiting Tasks</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-0.5">{pending.length} pending · {completed.length} completed</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
          <Plus className="w-4 h-4 mr-1.5" /> New Task
        </Button>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        {showForm && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5 mb-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Type</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-[#B8956A]/20 bg-white text-sm"
                >
                  {TASK_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Prospect Name (optional)</Label>
              <Input value={form.prospect_name} onChange={(e) => setForm({ ...form, prospect_name: e.target.value })} placeholder="John Doe" />
            </div>
            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5 block">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Task details..." className="bg-[#FFFBF5]" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSubmit} className="bg-[#B8956A] hover:bg-[#A68559] text-white">Create Task</Button>
              <Button variant="outline" onClick={() => setShowForm(false)} className="border-[#B8956A]/20">Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckSquare className="w-10 h-10 text-[#B8956A]/30 mb-3" />
            <p className="text-[#1A1A1A] font-medium">No tasks yet</p>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">Create a task to track follow-ups and outreach</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1A]/60 mb-2 uppercase tracking-wide">Pending</h3>
                <div className="space-y-2">{pending.map(renderTask)}</div>
              </div>
            )}
            {completed.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#1A1A1A]/60 mb-2 uppercase tracking-wide">Completed</h3>
                <div className="space-y-2">{completed.map(renderTask)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}