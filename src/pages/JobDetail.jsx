import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, User, Calendar, FolderOpen, ArrowLeft, Film, Camera, Upload, Scissors, CheckCircle2, Package, Cloud, DollarSign, Clock } from "lucide-react";
import EditingTaskDetail from "@/components/editing/EditingTaskDetail";

const PRODUCTION_STATUS_LABELS = {
  awaiting_capture: "Awaiting Capture",
  awaiting_upload: "Awaiting Upload",
  partial_upload: "Partial Upload",
  ready_for_editing: "Ready for Editing",
  editing: "Editing",
  quality_control: "Quality Control",
  revision: "Revision",
  ready_for_delivery: "Ready for Delivery",
  delivered: "Delivered",
  no_editing_required: "No Editing Required",
};

const PRODUCTION_STATUS_COLORS = {
  awaiting_capture: "bg-gray-100 text-gray-700",
  awaiting_upload: "bg-amber-100 text-amber-800",
  partial_upload: "bg-amber-100 text-amber-800",
  ready_for_editing: "bg-blue-100 text-blue-800",
  editing: "bg-purple-100 text-purple-800",
  quality_control: "bg-cyan-100 text-cyan-800",
  revision: "bg-orange-100 text-orange-800",
  ready_for_delivery: "bg-green-100 text-green-800",
  delivered: "bg-gray-100 text-gray-600",
  no_editing_required: "bg-gray-100 text-gray-500",
};

const TASK_STATUS_LABELS = {
  waiting_for_upload: "Waiting for Upload",
  ready_for_editing: "Ready",
  assigned: "Assigned",
  editing: "Editing",
  submitted_for_qc: "QC Review",
  revision_required: "Revision",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const PIPELINE_STAGES = [
  { key: "capture", label: "CAPTURE", icon: Camera },
  { key: "uploads", label: "UPLOADS", icon: Upload },
  { key: "post-production", label: "POST-PRODUCTION", icon: Scissors },
  { key: "qc", label: "QC", icon: CheckCircle2 },
  { key: "delivery", label: "DELIVERY", icon: Package },
];

export default function JobDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job_id");
  const [job, setJob] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [editors, setEditors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);

  const loadData = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const queueRes = await base44.functions.invoke("getEditingQueue", {});
      const allTasks = queueRes?.data?.tasks || [];
      const jobTasks = allTasks.filter((t) => t.job_id === jobId);
      setTasks(jobTasks);
      setEditors(queueRes?.data?.editors || []);

      // Fetch the job directly
      const jobs = await base44.entities.Job.filter({ id: jobId });
      if (jobs && jobs.length > 0) setJob(jobs[0]);
    } catch (err) {
      console.error("JobDetail load error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-[#1A1A1A]/60">Job not found.</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  const folderId = job.google_drive_folder_url?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2 text-[#1A1A1A]/60">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-xl font-bold text-[#1A1A1A]">{job.title || job.location}</h1>
          {job.location && (
            <p className="text-sm text-[#1A1A1A]/60 flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" /> {job.location}
            </p>
          )}
        </div>
        <Badge className={`${PRODUCTION_STATUS_COLORS[job.production_status] || "bg-gray-100"} text-sm`}>
          {PRODUCTION_STATUS_LABELS[job.production_status] || job.production_status}
        </Badge>
      </div>

      {/* Job Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard icon={User} label="Client" value={job.client_name} />
        <InfoCard icon={Calendar} label="Date" value={job.date} />
        <InfoCard icon={Package} label="Package" value={job.package} />
        <InfoCard icon={DollarSign} label="Pay Rate" value={`$${job.pay_rate || 0}`} />
      </div>

      {/* Production Pipeline */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-[#1A1A1A]/70 mb-3">PRODUCTION PIPELINE</h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {PIPELINE_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const isActive = getStageActive(stage.key, job, tasks);
            const isComplete = getStageComplete(stage.key, job, tasks);
            return (
              <React.Fragment key={stage.key}>
                <div className={`flex flex-col items-center gap-1 shrink-0 ${isActive ? "opacity-100" : "opacity-50"}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isComplete ? "bg-green-100 text-green-700" :
                    isActive ? "bg-[#B8956A] text-white" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-[#1A1A1A]/70">{stage.label}</span>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={`h-0.5 w-8 sm:w-16 ${isComplete ? "bg-green-300" : "bg-gray-200"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Stage Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CAPTURE */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A]/70 mb-2 flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#B8956A]" /> CAPTURE
          </h3>
          <div className="space-y-1 text-sm">
            <Row label="Capture Status" value={job.capture_status || (job.media_partner_status === "job_completed" ? "captured" : "pending")} />
            <Row label="Media Partner" value={job.booked_by_name || job.booked_by || "—"} />
            <Row label="Completed At" value={job.completed_at ? new Date(job.completed_at).toLocaleString() : "—"} />
            <Row label="MP Fulfillment" value={job.media_partner_fulfillment_status || "pending"} />
          </div>
        </Card>

        {/* UPLOADS */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A]/70 mb-2 flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#B8956A]" /> UPLOADS
          </h3>
          <div className="space-y-1 text-sm">
            <Row label="Upload Status" value={job.source_upload_status || (job.footage_uploaded ? "complete" : "not_started")} />
            <Row label="Storage Provider" value={job.source_storage_provider || "GOOGLE_DRIVE"} />
            {job.google_drive_folder_url && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(job.google_drive_folder_url, "_blank")}
                  className="text-[#B8956A] border-[#B8956A]/30"
                >
                  <FolderOpen className="w-4 h-4 mr-1" /> Open Source Folder
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* POST-PRODUCTION */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A]/70 mb-2 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[#B8956A]" /> POST-PRODUCTION
          </h3>
          <div className="space-y-1 text-sm">
            <Row label="Production Status" value={PRODUCTION_STATUS_LABELS[job.production_status] || job.production_status} />
            <Row label="Editing Tasks" value={`${tasks.length} total`} />
            <Row label="Active Tasks" value={tasks.filter(t => !["delivered", "cancelled"].includes(t.status)).length} />
          </div>
        </Card>

        {/* DELIVERY */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A]/70 mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-[#B8956A]" /> DELIVERY
          </h3>
          <div className="space-y-1 text-sm">
            <Row label="Delivery Status" value={job.delivery_status || (job.delivered_to_customer ? "delivered" : "pending")} />
            <Row label="Delivered At" value={job.delivered_at ? new Date(job.delivered_at).toLocaleString() : "—"} />
            <Row label="Overall Status" value={job.status} />
            <Row label="Paid Out At" value={job.paid_out_at ? new Date(job.paid_out_at).toLocaleString() : "—"} />
          </div>
        </Card>
      </div>

      {/* Editing Tasks */}
      {tasks.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A]/70 mb-3 flex items-center gap-2">
            <Film className="w-4 h-4 text-[#B8956A]" /> EDITING TASKS ({tasks.length})
          </h3>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="flex items-center justify-between p-3 rounded-lg border border-[#B8956A]/15 hover:bg-[#FFFBF5] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Film className="w-4 h-4 text-[#B8956A]" />
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{task.task_label}</p>
                    {task.editor_name && (
                      <p className="text-xs text-[#1A1A1A]/50">{task.editor_name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {task.required_source_media && task.required_source_media !== "all" && (
                    <Badge variant="outline" className="text-xs text-[#B8956A] border-[#B8956A]/30">
                      {task.required_source_media}
                    </Badge>
                  )}
                  <Badge className={`text-xs ${
                    task.status === "delivered" ? "bg-gray-100 text-gray-600" :
                    task.status === "editing" ? "bg-purple-100 text-purple-800" :
                    task.status === "ready_for_editing" ? "bg-blue-100 text-blue-800" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {TASK_STATUS_LABELS[task.status] || task.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <EditingTaskDetail
          task={selectedTask}
          editors={editors}
          onClose={() => setSelectedTask(null)}
          onActionComplete={() => {
            setSelectedTask(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function getStageActive(stage, job, tasks) {
  switch (stage) {
    case "capture": return job.capture_status !== "pending" || job.media_partner_status !== "awaiting_arrival";
    case "uploads": return job.footage_uploaded || job.source_upload_status === "complete";
    case "post-production": return tasks.length > 0;
    case "qc": return tasks.some(t => t.status === "submitted_for_qc" || t.status === "approved");
    case "delivery": return job.delivery_status === "delivered" || job.delivered_to_customer;
    default: return false;
  }
}

function getStageComplete(stage, job, tasks) {
  switch (stage) {
    case "capture": return job.capture_status === "captured" || job.media_partner_status === "job_completed";
    case "uploads": return job.source_upload_status === "complete" || job.footage_uploaded;
    case "post-production": return tasks.length > 0 && tasks.every(t => ["approved", "delivered", "cancelled"].includes(t.status));
    case "qc": return tasks.length > 0 && tasks.every(t => ["approved", "delivered", "cancelled"].includes(t.status));
    case "delivery": return job.delivery_status === "delivered" || job.delivered_to_customer;
    default: return false;
  }
}

function InfoCard({ icon: Icon, label, value }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-[#B8956A]" />
        <span className="text-xs text-[#1A1A1A]/50">{label}</span>
      </div>
      <p className="text-sm font-medium text-[#1A1A1A] truncate">{value || "—"}</p>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#1A1A1A]/50">{label}</span>
      <span className="font-medium text-[#1A1A1A] capitalize">{value || "—"}</span>
    </div>
  );
}