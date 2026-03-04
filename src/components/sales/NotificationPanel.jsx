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
      {/* Burger Menu Button - attached to panel */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 z-50 p-3 hover:bg-gray-200/30 transition rounded-r-lg"
        style={{
          color: '#B8956A',
          top: '50%',
          transform: 'translateY(-50%)',
          backgroundColor: '#FFFFFF',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}
        title="Notifications"
      >
        <div className="space-y-1.5">
          <div className="w-5 h-0.5" style={{ backgroundColor: '#B8956A' }}></div>
          <div className="w-5 h-0.5" style={{ backgroundColor: '#B8956A' }}></div>
          <div className="w-5 h-0.5" style={{ backgroundColor: '#B8956A' }}></div>
        </div>
        {upcomingTasks.length > 0 && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></div>
        )}
      </button>

      {/* Notification Panel - slides from left */}
      <div
        className="fixed left-0 top-0 h-screen w-80 bg-white border-r overflow-y-auto z-40 shadow-lg transition-transform duration-300"
        style={{
          borderColor: '#B8956A/20',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#B8956A/20', backgroundColor: '#FFFBF5' }}>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" style={{ color: '#B8956A' }} />
            <h2 className="font-semibold" style={{ color: '#1A1A1A' }}>Upcoming Tasks</h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
            {loading ? (
              <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>Loading...</p>
            ) : upcomingTasks.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>No upcoming tasks</p>
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg border transition hover:shadow-sm"
                    style={{
                      borderColor: '#B8956A/30',
                      backgroundColor: isToday(new Date(task.activity_date)) ? 'rgba(184, 149, 106, 0.1)' : '#FFFFFF'
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: '#1A1A1A' }}>
                          {task.contact_name || task.company_name || 'Unnamed'}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'rgba(26, 26, 26, 0.6)' }}>
                          {format(new Date(task.activity_date), "MMM d 'at' h:mm a")}
                        </p>
                        <p className="text-xs mt-1 truncate" style={{ color: 'rgba(26, 26, 26, 0.5)' }}>
                          {task.notes}
                        </p>
                        {isToday(new Date(task.activity_date)) && (
                          <div className="mt-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: '#B8956A', color: '#fff' }}>
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
      )}

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