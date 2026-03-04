import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Menu, X, Bell, Clock, Calendar } from "lucide-react";
import { format, isToday } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function TaskNotificationPanel({ salesMemberId }) {
  const [open, setOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    if (!salesMemberId) return;
    loadTasks();
  }, [salesMemberId]);

  const loadTasks = async () => {
    try {
      const logs = await base44.entities.ActivityLog.filter(
        { sales_member_id: salesMemberId },
        'activity_date',
        100
      );
      const now = new Date();
      const upcoming = logs.filter(l => new Date(l.activity_date) > now)
        .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));
      setUpcomingTasks(upcoming);

      const todayTasks = upcoming.filter(t => isToday(new Date(t.activity_date)));
      setTodayCount(todayTasks.length);

      // Auto-open if there are tasks today (on first load)
      if (todayTasks.length > 0) {
        setOpen(true);
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
    }
  };

  const activityColors = {
    call: "bg-blue-100 text-blue-700",
    email: "bg-green-100 text-green-700",
    meeting: "bg-purple-100 text-purple-700",
    task: "bg-amber-100 text-amber-700",
    note: "bg-gray-100 text-gray-700",
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[9990] flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-r-xl shadow-lg transition-all"
        style={{ backgroundColor: '#1A1A1A', color: '#FFFBF5' }}
        title="Task Notifications"
      >
        <div className="relative">
          <Menu className="w-5 h-5" />
          {todayCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {todayCount}
            </span>
          )}
        </div>
        <span className="text-xs font-medium" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: '9px', letterSpacing: '0.05em' }}>TASKS</span>
      </button>

      {/* Slide-out Panel */}
      <div
        className="fixed left-0 top-0 h-full z-[9989] transition-transform duration-300 ease-in-out shadow-2xl"
        style={{
          width: '300px',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid rgba(184,149,106,0.3)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(184,149,106,0.3)' }}>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" style={{ color: '#B8956A' }} />
            <span className="font-semibold text-sm" style={{ color: '#FFFBF5' }}>Upcoming Tasks</span>
            {todayCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs">{todayCount} today</Badge>
            )}
          </div>
          <button onClick={() => setOpen(false)} style={{ color: '#FFFBF5' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ paddingTop: '60px' }}>
          {upcomingTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Calendar className="w-8 h-8 mb-2" style={{ color: 'rgba(26,26,26,0.3)' }} />
              <p className="text-sm font-medium" style={{ color: 'rgba(26,26,26,0.5)' }}>No upcoming tasks</p>
            </div>
          ) : (
            <>
              {/* Today's tasks */}
              {upcomingTasks.filter(t => isToday(new Date(t.activity_date))).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: '#B8956A' }}>Today</p>
                  {upcomingTasks
                    .filter(t => isToday(new Date(t.activity_date)))
                    .map(task => (
                      <TaskCard key={task.id} task={task} activityColors={activityColors} highlight />
                    ))}
                </div>
              )}

              {/* Upcoming tasks (not today) */}
              {upcomingTasks.filter(t => !isToday(new Date(t.activity_date))).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2 px-1 mt-3" style={{ color: 'rgba(26,26,26,0.4)' }}>Upcoming</p>
                  {upcomingTasks
                    .filter(t => !isToday(new Date(t.activity_date)))
                    .map(task => (
                      <TaskCard key={task.id} task={task} activityColors={activityColors} />
                    ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[9988]"
          style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TaskCard({ task, activityColors, highlight }) {
  const date = new Date(task.activity_date);
  return (
    <div
      className="rounded-lg p-3 mb-2 border"
      style={{
        backgroundColor: highlight ? 'rgba(184,149,106,0.08)' : '#F9F9F9',
        borderColor: highlight ? 'rgba(184,149,106,0.4)' : 'rgba(0,0,0,0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${activityColors[task.activity_type] || 'bg-gray-100 text-gray-700'}`}>
          {task.activity_type}
        </span>
        <span className="text-xs font-medium flex items-center gap-1" style={{ color: highlight ? '#B8956A' : 'rgba(26,26,26,0.5)' }}>
          <Clock className="w-3 h-3" />
          {isToday(date) ? format(date, 'h:mm a') : format(date, 'MMM d, h:mm a')}
        </span>
      </div>
      {task.contact_name && (
        <p className="text-xs font-medium" style={{ color: '#1A1A1A' }}>{task.contact_name}</p>
      )}
      {task.company_name && (
        <p className="text-xs" style={{ color: 'rgba(26,26,26,0.5)' }}>{task.company_name}</p>
      )}
      {task.notes && (
        <p className="text-xs mt-1 line-clamp-2" style={{ color: 'rgba(26,26,26,0.7)' }}>{task.notes}</p>
      )}
    </div>
  );
}