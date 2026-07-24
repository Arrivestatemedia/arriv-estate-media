import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, CheckCircle2, Briefcase } from "lucide-react";
import JobCard from "@/components/jobs/JobCard";

export default function CompletedJobsSection({ jobs, user, onEdit, onBook, onUpdateBackup }) {
  const [open, setOpen] = useState(false);
  const completed = jobs.filter((j) => j.status === "completed" || j.status === "archived");

  return (
    <div className="mb-8">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border-2 border-[#B8956A]/20 bg-white hover:bg-[#FFFBF5] transition-colors"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-semibold text-[#1A1A1A]">Completed Jobs</h2>
          <span className="text-sm text-[#1A1A1A]/50">({completed.length})</span>
        </span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-[#1A1A1A]/60" />
        ) : (
          <ChevronDown className="w-5 h-5 text-[#1A1A1A]/60" />
        )}
      </button>

      {open && (
        <div className="mt-4">
          {completed.length === 0 ? (
            <Card className="border-2 border-dashed border-[#B8956A]/30 bg-white">
              <CardContent className="text-center py-12">
                <Briefcase className="w-12 h-12 mx-auto mb-4 text-[#B8956A]/40" />
                <p className="text-[#1A1A1A]/60">No completed jobs yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completed.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  isAdmin={true}
                  onManage={onEdit}
                  onBook={onBook}
                  onUpdateBackup={onUpdateBackup}
                  currentUserEmail={user?.email}
                  userRole="admin"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}