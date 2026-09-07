import React from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2, Film, MapPin, User, FolderOpen, ArrowUpRight } from "lucide-react";

const SOURCE_MEDIA_LABELS = {
  photo: "Photo Source",
  video: "Video Source",
  drone: "Drone Source",
  all: "All Source",
};

const STATUS_LABELS = {
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

const STATUS_COLORS = {
  waiting_for_upload: "bg-amber-100 text-amber-800 border-amber-200",
  ready_for_editing: "bg-blue-100 text-blue-800 border-blue-200",
  assigned: "bg-indigo-100 text-indigo-800 border-indigo-200",
  editing: "bg-purple-100 text-purple-800 border-purple-200",
  submitted_for_qc: "bg-cyan-100 text-cyan-800 border-cyan-200",
  revision_required: "bg-orange-100 text-orange-800 border-orange-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  delivered: "bg-gray-100 text-gray-700 border-gray-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const SLA_COLORS = {
  on_track: "text-green-600",
  due_soon: "text-yellow-600",
  at_risk: "text-orange-600",
  overdue: "text-red-600",
};

const PRIORITY_COLORS = {
  rush: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  normal: "bg-gray-200 text-gray-700",
  low: "bg-gray-100 text-gray-500",
};

export default function EditingTaskCard({ task, onClick, editors, onActionComplete }) {
  const navigate = useNavigate();
  const deadline = task.delivery_deadline ? new Date(task.delivery_deadline) : null;
  const hoursLeft = deadline ? Math.round((deadline.getTime() - Date.now()) / (60 * 60 * 1000)) : null;

  const handleOpenSource = (e) => {
    e.stopPropagation();
    if (task.storage_folder_url) window.open(task.storage_folder_url, "_blank");
  };

  const handleViewJob = (e) => {
    e.stopPropagation();
    if (task.job_id) navigate(`/JobDetail?job_id=${task.job_id}`);
  };

  return (
    <Card
      className="p-4 cursor-pointer hover:shadow-md transition-all border-l-4"
      style={{
        borderLeftColor:
          task.sla_status === "overdue" ? "#ef4444" :
          task.sla_status === "at_risk" ? "#f97316" :
          task.sla_status === "due_soon" ? "#eab308" :
          task.priority === "rush" ? "#ef4444" :
          "#B8956A",
      }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Film className="w-4 h-4 text-[#B8956A] shrink-0" />
            <span className="font-medium text-[#1A1A1A] truncate">{task.task_label}</span>
            {task.priority === "rush" && (
              <Badge className="bg-red-500 text-white text-xs">RUSH</Badge>
            )}
            {task.required_source_media && task.required_source_media !== "all" && (
              <Badge variant="outline" className="text-xs text-[#B8956A] border-[#B8956A]/30">
                {SOURCE_MEDIA_LABELS[task.required_source_media] || task.required_source_media}
              </Badge>
            )}
          </div>
          <p className="text-sm text-[#1A1A1A]/70 truncate">{task.client_name || "Unknown client"}</p>
          {task.property_address && (
            <p className="text-xs text-[#1A1A1A]/50 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" /> {task.property_address}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {task.editor_name && (
              <span className="text-xs text-[#1A1A1A]/60 flex items-center gap-1">
                <User className="w-3 h-3" /> {task.editor_name}
              </span>
            )}
            {task.active_editing_minutes > 0 && (
              <span className="text-xs text-[#1A1A1A]/60 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {Math.round(task.active_editing_minutes)}min
              </span>
            )}
            {task.revision_count > 0 && (
              <span className="text-xs text-orange-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Rev {task.revision_count}
              </span>
            )}
            {task.storage_folder_url && (
              <button
                onClick={handleOpenSource}
                className="text-xs text-[#B8956A] hover:underline flex items-center gap-1"
              >
                <FolderOpen className="w-3 h-3" /> Source
              </button>
            )}
            {task.job_id && (
              <button
                onClick={handleViewJob}
                className="text-xs text-[#1A1A1A]/50 hover:text-[#B8956A] flex items-center gap-0.5"
              >
                Job <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={`${STATUS_COLORS[task.status] || "bg-gray-100"} text-xs`}>
            {STATUS_LABELS[task.status] || task.status}
          </Badge>
          {deadline && task.status !== "delivered" && task.status !== "cancelled" && (
            <span className={`text-xs font-medium ${SLA_COLORS[task.sla_status] || ""}`}>
              {hoursLeft !== null && hoursLeft < 0
                ? `${Math.abs(hoursLeft)}h over`
                : `${hoursLeft}h left`}
            </span>
          )}
          {task.status === "delivered" && (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          )}
        </div>
      </div>
    </Card>
  );
}