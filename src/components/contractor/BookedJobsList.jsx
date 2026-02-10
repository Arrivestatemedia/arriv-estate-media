import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, Clock, DollarSign } from "lucide-react";
import { format } from "date-fns";

const jobTypeConfig = {
  photo: { label: "Photo", icon: "📷" },
  video: { label: "Video", icon: "🎥" },
  photo_video: { label: "Photo & Video", icon: "📸" }
};

const statusConfig = {
  booked: { label: "Booked", color: "bg-blue-100 text-blue-800" },
  in_progress: { label: "In Progress", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "Completed", color: "bg-green-100 text-green-800" }
};

export default function BookedJobsList({ jobs, loading }) {
  if (loading) {
    return (
      <Card className="border-[#B8956A]/20">
        <CardHeader>
          <CardTitle className="text-[#1A1A1A]">My Booked Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[#1A1A1A]/60 text-center py-8">Loading jobs...</p>
        </CardContent>
      </Card>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <Card className="border-[#B8956A]/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-[#B8956A]" />
            </div>
            <CardTitle className="text-[#1A1A1A]">My Booked Jobs</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-[#1A1A1A]/60 text-center py-8">
            You haven't booked any jobs yet. Check the{" "}
            <Link 
              to={createPageUrl("JobBoard")} 
              className="text-[#B8956A] hover:text-[#A68559] font-semibold underline"
            >
              Available Jobs
            </Link>{" "}
            page to find work!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#B8956A]/20">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#B8956A]/10 rounded-full flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-[#B8956A]" />
          </div>
          <CardTitle className="text-[#1A1A1A]">My Booked Jobs ({jobs.length})</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {jobs.map((job) => {
            const jobType = jobTypeConfig[job.type] || jobTypeConfig.photo;
            const status = statusConfig[job.status] || statusConfig.booked;

            return (
              <div
                key={job.id}
                className="p-4 bg-white rounded-lg border border-[#B8956A]/20 hover:border-[#B8956A]/40 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-[#1A1A1A] text-lg flex items-center gap-2">
                      {jobType.icon} {job.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={status.color}>
                        {status.label}
                      </Badge>
                      <Badge variant="outline" className="border-[#B8956A]/30">
                        {jobType.label}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-[#B8956A]">
                      ${job.pay_rate}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-[#1A1A1A]/70">
                    <MapPin className="w-4 h-4 text-[#B8956A]" />
                    {job.location}
                  </div>
                  <div className="flex items-center gap-2 text-[#1A1A1A]/70">
                    <Calendar className="w-4 h-4 text-[#B8956A]" />
                    {format(new Date(job.date), 'MMM d, yyyy')}
                  </div>
                  {job.start_time && (
                    <div className="flex items-center gap-2 text-[#1A1A1A]/70">
                      <Clock className="w-4 h-4 text-[#B8956A]" />
                      {job.start_time}
                      {job.duration_hours && ` (${job.duration_hours}h)`}
                    </div>
                  )}
                </div>

                {job.description && (
                  <p className="text-sm text-[#1A1A1A]/60 mt-3 pt-3 border-t border-[#B8956A]/10">
                    {job.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}