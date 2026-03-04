import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ChevronRight, X, Bell } from 'lucide-react';
import { format, isToday } from 'date-fns';

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
        
        const upcoming = activities
          .filter(a => new Date(a.activity_date) > new Date())
          .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date));
        
        setUpcomingTasks(upcoming);
        
        // Auto-open if there's a task today
        const hasTaskToday = upcoming.some(t => isToday(new Date(t.activity_date)));
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
        }}
      >
        {/* Notification Panel */}
        <div
          className="h-screen w-full bg-[#1A1A1A] overflow-y-auto shadow-lg flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b flex-shrink-0" style={{ borderColor: '#B8956A' }}>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" style={{ color: '#B8956A' }} />
              <h2 className="font-semibold" style={{ color: '#B8956A' }}>Tasks</h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 flex-1 flex flex-col">
            {loading ? (
              <p className="text-sm" style={{ color: '#B8956A' }}>Loading...</p>
            ) : upcomingTasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-center" style={{ color: '#B8956A' }}>No upcoming tasks</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg border transition hover:shadow-sm"
                    style={{
                      borderColor: '#B8956A',
                      backgroundColor: isToday(new Date(task.activity_date)) ? '#B8956A/20' : '#1A1A1A'
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: '#B8956A' }}>
                          {task.contact_name || task.company_name || 'Unnamed'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#B8956A/70' }}>
                          {format(new Date(task.activity_date), "MMM d 'at' h:mm a")}
                        </p>
                        <p className="text-xs mt-1 truncate" style={{ color: '#B8956A/60' }}>
                          {task.notes}
                        </p>
                        {isToday(new Date(task.activity_date)) && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                              Today
                            </span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: '#B8956A' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Burger Button - attached to panel edge */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="absolute left-full top-1/2 transform -translate-y-1/2 pl-3 pr-1 py-8 transition -ml-6"
          style={{
            backgroundColor: '#1A1A1A',
            color: '#B8956A',
            borderTopLeftRadius: '0',
            borderBottomLeftRadius: '0',
            borderTopRightRadius: '20px',
            borderBottomRightRadius: '20px'
          }}
          title="Tasks"
        >
          <div className="space-y-0.5 flex flex-col items-end">
            <div className="w-6 h-px" style={{ backgroundColor: '#B8956A' }}></div>
            <div className="w-6 h-px" style={{ backgroundColor: '#B8956A' }}></div>
            <div className="w-6 h-px" style={{ backgroundColor: '#B8956A' }}></div>
          </div>
          {upcomingTasks.length > 0 && (
            <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></div>
          )}
        </button>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
}