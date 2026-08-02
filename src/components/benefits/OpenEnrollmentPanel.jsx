import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Calendar, ExternalLink, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OpenEnrollmentPanel({ salesMemberId }) {
  const [enrollment, setEnrollment] = useState(null);
  const [portalUrl, setPortalUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_open_enrollment",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setEnrollment(data.open_enrollment);
      setPortalUrl(data.benefits_portal_url || "");
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading open enrollment...</div>;
  }

  if (!enrollment || !enrollment.is_active) {
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Open Enrollment</h3>
        </div>
        <p className="text-xs text-slate-500">There is no active open enrollment period right now. You'll be notified when the next window opens.</p>
      </div>
    );
  }

  const startDate = enrollment.start_date ? new Date(enrollment.start_date) : null;
  const endDate = enrollment.end_date ? new Date(enrollment.end_date) : null;
  const now = new Date();
  const daysLeft = endDate ? Math.ceil((endDate.getTime() - now.getTime()) / 86400000) : 0;

  return (
    <div className="p-4 rounded-xl border border-[#B8956A]/30 bg-[#FFFBF5]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-[#B8956A]" />
            <h3 className="text-sm font-semibold text-slate-900">Open Enrollment is Active</h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {startDate?.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {endDate?.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
          {daysLeft > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">{daysLeft} days remaining</span>
            </div>
          )}
        </div>
        {portalUrl && (
          <Button size="sm" onClick={() => window.open(portalUrl, "_blank")}>
            <ExternalLink className="w-4 h-4" /> Enroll Now
          </Button>
        )}
      </div>

      {enrollment.message && (
        <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">{enrollment.message}</p>
      )}
    </div>
  );
}