import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronRight, Bell, Phone, Mail, Calendar, Clock } from 'lucide-react';
import { format, isToday, isPast } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function NotificationPanel({ userEmail }) {
  const [isOpen, setIsOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userEmail) return;

    const loadUpcomingTasks = async () => {
      setLoading(true);
      try {
        const activities = await base44.entities.ActivityLog.filter({
          sales_member_email: userEmail
        }, '-activity_date', 100);

        const upcoming = activities.
        filter((a) => new Date(a.activity_date) > new Date()).
        sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));

        setUpcomingTasks(upcoming);

        // Auto-open if there's a task today
        const hasTaskToday = upcoming.some((t) => isToday(new Date(t.activity_date)));
        if (hasTaskToday) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Failed to load upcoming tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUpcomingTasks();

    // Subscribe to real-time updates
    const unsubscribe = base44.entities.ActivityLog.subscribe(() => {
      loadUpcomingTasks();
    });

    return unsubscribe;
  }, [userEmail]);

  return (
    <>
      {/* Sliding Panel Container with Burger Button */}
      <div
        className="fixed left-0 top-0 h-screen z-50 transition-transform duration-300"
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          width: '320px'
        }}>

        {/* Notification Panel */}
        <div
          className="h-screen w-full bg-[#1A1A1A] overflow-y-auto shadow-lg flex flex-col">

          {/* Header */}
          <div className="p-4 border-b flex-shrink-0" style={{ borderColor: '#B8956A' }}>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" style={{ color: '#B8956A' }} />
              <h2 className="font-semibold" style={{ color: '#B8956A' }}>Tasks</h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            {loading ? (
              <p className="text-sm" style={{ color: '#B8956A' }}>Loading...</p>
            ) : upcomingTasks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                <Clock className="w-8 h-8 opacity-30" style={{ color: '#B8956A' }} />
                <p className="text-sm" style={{ color: 'rgba(255,251,245,0.5)' }}>No upcoming tasks</p>
                <button
                  onClick={() => { setIsOpen(false); window.location.href = createPageUrl('HubSpotActivityLog') + '?tab=queue'; }}
                  className="text-xs underline mt-1"
                  style={{ color: '#B8956A' }}
                >
                  Open Call Queue →
                </button>
              </div>
            ) : (
              <>
                {/* Overdue section */}
                {upcomingTasks.filter(t => isPast(new Date(t.activity_date)) && !isToday(new Date(t.activity_date))).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#ef4444' }}>Overdue</p>
                    <div className="space-y-2">
                      {upcomingTasks.filter(t => isPast(new Date(t.activity_date)) && !isToday(new Date(t.activity_date))).map(task => (
                        <TaskItem key={task.id} task={task} overdue onClose={() => setIsOpen(false)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Today section */}
                {upcomingTasks.filter(t => isToday(new Date(t.activity_date))).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#B8956A' }}>Today</p>
                    <div className="space-y-2">
                      {upcomingTasks.filter(t => isToday(new Date(t.activity_date))).map(task => (
                        <TaskItem key={task.id} task={task} today onClose={() => setIsOpen(false)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming section */}
                {upcomingTasks.filter(t => !isPast(new Date(t.activity_date)) && !isToday(new Date(t.activity_date))).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,251,245,0.4)' }}>Upcoming</p>
                    <div className="space-y-2">
                      {upcomingTasks.filter(t => !isPast(new Date(t.activity_date)) && !isToday(new Date(t.activity_date))).slice(0, 5).map(task => (
                        <TaskItem key={task.id} task={task} onClose={() => setIsOpen(false)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA to open queue */}
                <button
                  onClick={() => { setIsOpen(false); window.location.href = createPageUrl('HubSpotActivityLog') + '?tab=queue'; }}
                  className="w-full mt-2 py-2 rounded-lg text-sm font-medium transition"
                  style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', border: '1px solid rgba(184,149,106,0.3)' }}
                >
                  Open Full Call Queue →
                </button>
              </>
            )}
          </div>
        </div>

        {/* Burger Button - attached to panel edge */}
        <button
          onClick={() => setIsOpen(!isOpen)} className="my-3 py-8 rounded absolute left-full top-1/2 transform -translate-y-1/2 transition"

          style={{
            backgroundColor: '#1A1A1A',
            color: '#B8956A',
            borderTopLeftRadius: '0',
            borderBottomLeftRadius: '0',
            borderTopRightRadius: '20px',
            borderBottomRightRadius: '20px'
          }}
          title="Tasks">

          <div className="flex flex-col items-end gap-1">
            <div className="w-3 h-px" style={{ backgroundColor: '#B8956A' }}></div>
            <div className="w-3 h-px" style={{ backgroundColor: '#B8956A' }}></div>
            <div className="w-3 h-px" style={{ backgroundColor: '#B8956A' }}></div>
            <p className="text-xs font-semibold mt-2" style={{ color: '#B8956A', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.05em' }}>TASKS</p>
          </div>
          {upcomingTasks.length > 0 &&
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></div>
          }
        </button>
      </div>

      {/* Overlay */}
      {isOpen &&
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
        onClick={() => setIsOpen(false)}>
      </div>
      }
    </>);

}