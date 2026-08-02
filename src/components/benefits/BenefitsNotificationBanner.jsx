import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, ExternalLink, AlertCircle, Info, CheckCircle2 } from "lucide-react";

const TYPE_CONFIG = {
  action_required: { icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  alert: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  success: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
};

export default function BenefitsNotificationBanner({ salesMemberId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageBenefits", {
        action: "get_notifications",
        sales_member_id: salesMemberId,
      });
      const data = res.data || res;
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading || notifications.length === 0) return null;

  return (
    <div className="space-y-2">
      {notifications.slice(0, 3).map((n, i) => {
        const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
        const Icon = cfg.icon;
        return (
          <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
            <Icon className={`w-4 h-4 ${cfg.color} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900">{n.title}</p>
              <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
              {n.link && (
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#B8956A] mt-2 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> {n.link_label || "Open"}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}