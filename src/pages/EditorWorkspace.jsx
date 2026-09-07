import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, Send, Clock, AlertTriangle, CheckCircle2, Film, RefreshCw, FileText, FolderOpen } from "lucide-react";
import { EDITING_TASK_LABELS, STATUS_LABELS } from "@/lib/editingConfig";

const SLA_COLORS = {
  on_track: "text-green-600",
  due_soon: "text-yellow-600",
  at_risk: "text-orange-600",
  overdue: "text-red-600",
};

export default function EditorWorkspace() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [finalMediaUrl, setFinalMediaUrl] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);

  const salesEmail =
    localStorage.getItem("sales_member_email") || sessionStorage.getItem("sales_member_email");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      let email = salesEmail;
      if (!email) {
        try {
          const user = await base44.auth.me();
          if (user) email = user.email;
        } catch (e) { /* not logged in via platform auth */ }
      }
      const res = await base44.functions.invoke("getEditorWorkspace", { email });
      setData(res);
    } catch (err) {
      console.error("Failed to load editor workspace:", err);
    } finally {
      setLoading(false);
    }
  }, [salesEmail]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const callAction = async (action, taskId, extra = {}) => {
    setActionLoading(true);
    try {
      await base44.functions.invoke("manageEditingTask", { action, task_id: taskId, ...extra });
      refresh();
    } catch (err) {
      alert(err.message || err.error || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-[#1A1A1A]/60">Failed to load workspace.</p>
      </div>
    );
  }

  if (!data.editor_profile) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <Film className="w-12 h-12 text-[#B8956A]/40 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-[#1A1A1A] mb-2">No Editor Profile</h2>
        <p className="text-[#1A1A1A]/60">
          You don't have an editor profile yet. An admin needs to create one for you with verified editing capabilities.
        </p>
      </div>
    );
  }

  const profile = data.editor_profile;
  const myTasks = data.my_tasks || [];
  const availableTasks = data.available_tasks || [];
  const completedTasks = data.completed_tasks || [];
  const activeSession = data.active_session;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Editor Workspace</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">
            {profile.employee_name} • {Math.round((data.weekly_minutes || 0))} min this week ({data.weekly_hours || 0}h)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Active session banner */}
      {activeSession && (
        <Card className="p-3 border-l-4 border-l-purple-500 bg-purple-50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600 animate-pulse" />
            <span className="text-sm font-medium text-purple-900">
              Active editing session on: {myTasks.find((t) => t.id === activeSession.editing_task_id)?.task_label || "a task"}
            </span>
          </div>
        </Card>
      )}

      {/* My Tasks */}
      <div>
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">My Tasks</h2>
        {myTasks.length === 0 ? (
          <Card className="p-8 text-center text-[#1A1A1A]/50">
            No tasks assigned to you. Check available work below.
          </Card>
        ) : (
          <div className="space-y-2">
            {myTasks.map((task) => (
              <EditorTaskRow
                key={task.id}
                task={task}
                actionLoading={actionLoading}
                finalMediaUrl={finalMediaUrl[task.id] || ""}
                onUrlChange={(url) => setFinalMediaUrl({ ...finalMediaUrl, [task.id]: url })}
                onAction={callAction}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Work */}
      <div>
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">Available Work (Unassigned)</h2>
        {availableTasks.length === 0 ? (
          <Card className="p-8 text-center text-[#1A1A1A]/50">
            No available tasks matching your capabilities right now.
          </Card>
        ) : (
          <div className="space-y-2">
            {availableTasks.map((task) => (
              <Card key={task.id} className="p-3 border-l-4 border-l-blue-400">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[#1A1A1A]">{task.task_label}</p>
                      {task.required_source_media && task.required_source_media !== "all" && (
                        <Badge variant="outline" className="text-xs text-[#B8956A] border-[#B8956A]/30">
                          {task.required_source_media}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#1A1A1A]/60">{task.client_name} • {task.property_address}</p>
                    {task.storage_folder_url && (
                      <a href={task.storage_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#B8956A] hover:underline mt-1 inline-block">
                        <FolderOpen className="w-3 h-3 inline mr-1" />Source footage
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => callAction("assign", task.id, { editor_profile_id: profile.id })}
                    disabled={actionLoading}
                  >
                    Claim
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed This Week */}
      <div>
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">Completed This Week</h2>
        {completedTasks.length === 0 ? (
          <Card className="p-8 text-center text-[#1A1A1A]/50">
            No completed tasks this week.
          </Card>
        ) : (
          <div className="space-y-2">
            {completedTasks.map((task) => (
              <Card key={task.id} className="p-3 opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#1A1A1A]">{task.task_label}</p>
                    <p className="text-sm text-[#1A1A1A]/60">{task.client_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#1A1A1A]/60">{task.active_editing_minutes} min</span>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditorTaskRow({ task, actionLoading, finalMediaUrl, onUrlChange, onAction }) {
  const deadline = task.delivery_deadline ? new Date(task.delivery_deadline) : null;
  const hoursLeft = deadline ? Math.round((deadline.getTime() - Date.now()) / (60 * 60 * 1000)) : null;

  return (
    <Card
      className="p-4 border-l-4"
      style={{
        borderLeftColor:
          task.sla_status === "overdue" ? "#ef4444" :
          task.sla_status === "at_risk" ? "#f97316" :
          task.sla_status === "due_soon" ? "#eab308" :
          task.priority === "rush" ? "#ef4444" :
          "#B8956A",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#B8956A] shrink-0" />
            <span className="font-medium text-[#1A1A1A]">{task.task_label}</span>
            {task.priority === "rush" && <Badge className="bg-red-500 text-white text-xs">RUSH</Badge>}
          </div>
          <p className="text-sm text-[#1A1A1A]/70 mt-0.5">{task.client_name}</p>
          <p className="text-xs text-[#1A1A1A]/50">{task.property_address}</p>
          {task.required_source_media && task.required_source_media !== "all" && (
            <span className="text-xs text-[#B8956A] mt-1 inline-block">
              Source: {task.required_source_media.toUpperCase()}
            </span>
          )}
          {(task.storage_folder_url || task.source_media_location) && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                window.open(task.storage_folder_url || task.source_media_location, "_blank");
              }}
              className="mt-2 text-[#B8956A] border-[#B8956A]/30 hover:bg-[#B8956A]/10"
            >
              <FolderOpen className="w-4 h-4 mr-1" /> Open Source Footage
            </Button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge className={
            task.status === "editing" ? "bg-purple-100 text-purple-800" :
            task.status === "revision_required" ? "bg-orange-100 text-orange-800" :
            task.status === "submitted_for_qc" ? "bg-cyan-100 text-cyan-800" :
            task.status === "approved" ? "bg-green-100 text-green-800" :
            "bg-indigo-100 text-indigo-800"
          }>
            {STATUS_LABELS[task.status]}
          </Badge>
          {deadline && (
            <span className={`text-xs font-medium ${SLA_COLORS[task.sla_status] || ""}`}>
              {hoursLeft < 0 ? `${Math.abs(hoursLeft)}h over` : `${hoursLeft}h left`}
            </span>
          )}
        </div>
      </div>

      {/* Revision reason */}
      {task.status === "revision_required" && task.revision_reason && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-2 mb-2">
          <p className="text-xs text-orange-900">{task.revision_reason}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {task.status === "assigned" && (
          <Button size="sm" onClick={() => onAction("start_editing", task.id, { editor_profile_id: task.editor_id })} disabled={actionLoading}>
            <Play className="w-4 h-4 mr-1" /> Start
          </Button>
        )}
        {task.status === "editing" && (
          <Button size="sm" variant="outline" onClick={() => onAction("pause_editing", task.id, { editor_profile_id: task.editor_id })} disabled={actionLoading}>
            <Pause className="w-4 h-4 mr-1" /> Pause
          </Button>
        )}
        {(task.status === "editing" || task.status === "revision_required") && (
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={finalMediaUrl}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="Final media URL (Google Drive link)..."
                className="flex-1 px-3 py-1.5 rounded-lg border border-[#B8956A]/20 text-sm"
              />
              <Button
                size="sm"
                onClick={() => onAction("submit_for_qc", task.id, { editor_profile_id: task.editor_id, final_media_location: finalMediaUrl })}
                disabled={actionLoading}
              >
                <Send className="w-4 h-4 mr-1" /> Submit QC
              </Button>
            </div>
          )}
        {task.active_editing_minutes > 0 && (
          <span className="text-xs text-[#1A1A1A]/60 flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" /> {task.active_editing_minutes} min
          </span>
        )}
      </div>
    </Card>
  );
}