import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Menu, X, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function UpcomingTasksNotificationPanel({ salesMemberEmail }) {
  const [isOpen, setIsOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [hasTasksToday, setHasTasksToday] = useState(false);

  useEffect(() => {
    if (!salesMemberEmail) return;

    const loadUpcomingTasks = async () => {
      try {
        const allActivities = await base44.entities.ActivityLog.filter(
          { sales_member_email: salesMemberEmail },
          '-activity_date',
          100
        );

        const now = new Date();
        const upcoming = allActivities
          .filter(a => new Date(a.activity_date) > now)
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));

        setUpcomingTasks(upcoming);

        // Check if there are tasks today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const tasksToday = upcoming.filter(a => {
          const activityDate = new Date(a.activity_date);
          activityDate.setHours(0, 0, 0, 0);
          return activityDate.getTime() === today.getTime();
        });

        setHasTasksToday(tasksToday.length > 0);
        if (tasksToday.length > 0) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Failed to load upcoming tasks:', error);
      }
    };

    loadUpcomingTasks();
    const sub = base44.entities.ActivityLog.subscribe(loadUpcomingTasks);
    return () => sub();
  }, [salesMemberEmail]);

  return (
    <div className="fixed left-0 top-16 z-40 h-screen flex">
      {/* Burger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 bg-[#1A1A1A] border-r border-[#B8956A]/20 flex items-center justify-center hover:bg-[#2A2A2A] transition"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {isOpen ? (
          <X className="w-5 h-5 text-[#FFFBF5]" />
        ) : (
          <Menu className="w-5 h-5 text-[#FFFBF5]" />
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="w-80 bg-[#1A1A1A] border-r border-[#B8956A]/20 overflow-y-auto max-h-screen">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-[#FFFBF5] mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#B8956A]" />
              Upcoming Tasks
            </h2>

            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-8 h-8 text-[#B8956A]/50 mx-auto mb-2" />
                <p className="text-[#FFFBF5]/60 text-sm">No upcoming tasks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg bg-[#FFFBF5]/5 border border-[#B8956A]/20 hover:bg-[#FFFBF5]/10 transition"
                  >
                    <p className="text-sm font-medium text-[#FFFBF5]">
                      {task.contact_name || task.company_name}
                    </p>
                    <p className="text-xs text-[#B8956A] mt-1">
                      {format(new Date(task.activity_date), "MMM d, h:mm a")}
                    </p>
                    <p className="text-xs text-[#FFFBF5]/60 mt-1 line-clamp-2">
                      {task.notes}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}