import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Film, Clock, AlertTriangle, CheckCircle2, Users, BarChart3, Settings, RefreshCw, Upload } from "lucide-react";
import EditingTaskCard from "@/components/editing/EditingTaskCard";
import EditingTaskDetail from "@/components/editing/EditingTaskDetail";
import EditorManager from "@/components/editing/EditorManager";
import EditingAnalytics from "@/components/editing/EditingAnalytics";

const STATUS_LABELS = {
  waiting_for_upload: "Waiting for Upload",
  ready_for_editing: "Ready for Editing",
  assigned: "Assigned",
  editing: "Editing",
  submitted_for_qc: "Submitted for QC",
  revision_required: "Revision Required",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLORS = {
  waiting_for_upload: "bg-amber-100 text-amber-800",
  ready_for_editing: "bg-blue-100 text-blue-800",
  assigned: "bg-indigo-100 text-indigo-800",
  editing: "bg-purple-100 text-purple-800",
  submitted_for_qc: "bg-cyan-100 text-cyan-800",
  revision_required: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  delivered: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function EditingQueuePage() {
  const [loading, setLoading] = useState(true);
  const [queueData, setQueueData] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [activeTab, setActiveTab] = useState("queue");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getEditingQueue");
      setQueueData(res);
    } catch (err) {
      console.error("Failed to load editing queue:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  if (loading && !queueData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  const counts = queueData?.counts || {};
  const tasks = queueData?.tasks || [];
  const byStatus = queueData?.by_status || {};

  const filteredTasks = filterStatus === "all" ? tasks : (byStatus[filterStatus] || []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Editing Queue</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">
            In-house post-production operations — Arriv editors only
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="editors">Editors</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        {/* QUEUE TAB */}
        <TabsContent value="queue" className="space-y-4">
          {/* Status summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Ready" count={counts.ready_for_editing || 0} icon={Film} color="text-blue-600" />
            <SummaryCard label="Editing" count={counts.editing + (counts.assigned || 0)} icon={Clock} color="text-purple-600" />
            <SummaryCard label="QC Review" count={counts.submitted_for_qc || 0} icon={CheckCircle2} color="text-cyan-600" />
            <SummaryCard label="Revisions" count={counts.revision_required || 0} icon={AlertTriangle} color="text-orange-600" />
            <SummaryCard label="Waiting Upload" count={counts.waiting_for_upload || 0} icon={Upload} color="text-amber-600" />
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All Active" value="all" current={filterStatus} onClick={setFilterStatus} count={counts.total_active} />
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <FilterChip
                key={key}
                label={label}
                value={key}
                current={filterStatus}
                onClick={setFilterStatus}
                count={counts[key] || 0}
              />
            ))}
          </div>

          {/* Task list */}
          <div className="space-y-2">
            {filteredTasks.length === 0 ? (
              <Card className="p-8 text-center text-[#1A1A1A]/50">
                No tasks in this status.
              </Card>
            ) : (
              filteredTasks.map((task) => (
                <EditingTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setSelectedTask(task)}
                  editors={queueData?.editors || []}
                  onActionComplete={refresh}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics">
          <EditingAnalytics refreshKey={refreshKey} />
        </TabsContent>

        {/* EDITORS TAB */}
        <TabsContent value="editors">
          <EditorManager editors={queueData?.editors || []} onRefresh={refresh} />
        </TabsContent>

        {/* EXCEPTIONS TAB */}
        <TabsContent value="exceptions" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1A1A1A] mb-2">Awaiting Media Partner Upload</h2>
            <p className="text-sm text-[#1A1A1A]/60 mb-4">
              Jobs where the Media Partner marked the shoot complete but source media has not been confirmed uploaded.
              Existing reminder workflows continue to notify the Media Partner.
            </p>
          </div>
          {(queueData?.upload_exceptions || []).length === 0 ? (
            <Card className="p-8 text-center text-[#1A1A1A]/50">
              No upload exceptions. All source media is flowing normally.
            </Card>
          ) : (
            <div className="space-y-2">
              {(queueData?.upload_exceptions || []).map((job) => (
                <Card key={job.id} className="p-4 border-l-4 border-l-amber-500">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-[#1A1A1A]">{job.client_name || "Unknown client"}</p>
                      <p className="text-sm text-[#1A1A1A]/60">{job.location}</p>
                      <p className="text-xs text-[#1A1A1A]/50 mt-1">
                        Media Partner: {job.booked_by_name || job.booked_by} • Package: {job.package}
                      </p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800">Upload Pending</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Task detail drawer */}
      {selectedTask && (
        <EditingTaskDetail
          task={selectedTask}
          editors={queueData?.editors || []}
          onClose={() => setSelectedTask(null)}
          onActionComplete={() => {
            setSelectedTask(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, count, icon: Icon, color }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-[#1A1A1A]/60">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1A1A1A]">{count}</p>
    </Card>
  );
}

function FilterChip({ label, value, current, onClick, count }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? "bg-[#B8956A] text-[#1A1A1A]"
          : "bg-white border border-[#B8956A]/20 text-[#1A1A1A]/70 hover:bg-[#B8956A]/10"
      }`}
    >
      {label} <span className="opacity-60">({count || 0})</span>
    </button>
  );
}