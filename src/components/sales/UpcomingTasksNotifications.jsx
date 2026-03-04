import React, { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

export default function UpcomingTasksNotifications({ userEmail }) {
  const [isOpen, setIsOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState([]);

  useEffect(() => {
    if (!userEmail) return;

    const loadUpcomingTasks = async () => {
      try {
        const activities = await base44.entities.ActivityLog.filter({
          sales_member_email: userEmail
        }, '-activity_date', 200);

        const now = new Date();
        const upcoming = activities
          .filter(a => new Date(a.activity_date) > now)
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
          .slice(0, 10);

        setUpcomingTasks(upcoming);

        // Auto-open if there's a task today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const taskToday = upcoming.some(task => {
          const taskDate = new Date(task.activity_date);
          taskDate.setHours(0, 0, 0, 0);
          return taskDate.getTime() === today.getTime();
        });

        if (taskToday) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Failed to load upcoming tasks:', error);
      }
    };

    loadUpcomingTasks();
    const sub = base44.entities.ActivityLog.subscribe(loadUpcomingTasks);
    return () => sub();
  }, [userEmail]);

  return (
    <>
      {/* Burger Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 top-20 z-40 p-2 rounded-lg hover:bg-gray-100 transition"
        style={{ color: '#B8956A' }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div
          className="fixed left-0 top-16 w-80 h-[calc(100vh-4rem)] bg-white shadow-lg z-39 overflow-y-auto"
          style={{ borderRight: '1px solid rgba(184, 149, 106, 0.2)' }}
        >
          <div className="p-4">
            <h2 className="font-semibold text-lg mb-4" style={{ color: '#1A1A1A' }}>
              Upcoming Tasks
            </h2>

            {upcomingTasks.length === 0 ? (
              <p style={{ color: 'rgba(26, 26, 26, 0.6)' }}>No upcoming tasks</p>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg border-l-4"
                    style={{ borderColor: '#B8956A', backgroundColor: 'rgba(184, 149, 106, 0.05)' }}
                  >
                    <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>
                      {task.contact_name || task.company_name || 'No contact'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#B8956A' }}>
                      {format(new Date(task.activity_date), "MMM d 'at' h:mm a")}
                    </p>
                    <p className="text-xs mt-2 line-clamp-2" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                      {task.notes}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}