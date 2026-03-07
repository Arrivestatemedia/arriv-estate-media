import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, Phone, ChevronRight, X } from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function NotificationPanel({ userEmail, isAdmin, queueUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [salesMember, setSalesMember] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  // No-op: tab switching is handled entirely by the destination page reading sessionStorage on mount

  useEffect(() => {
    if (!userEmail) return;
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [userEmail]);

  const loadData = async () => {
    if (!userEmail) return;
    try {
      const members = await base44.entities.SalesTeamMember.filter({ email: userEmail });
      const member = members?.[0];
      if (!member) return;
      setSalesMember(member);

      const now = new Date();

      // Fetch all logs to build comprehensive phone lookup
      const allLogs = await base44.entities.ActivityLog.filter(
        { sales_member_id: member.id },
        '-activity_date',
        200
      );

      // Build aggressive phone lookup from entire history
      const phoneLookup = {};
      allLogs.forEach(a => {
        if (a.contact_email && a.contact_phone) {
          phoneLookup[a.contact_email] = a.contact_phone;
        }
        if (a.contact_name && a.contact_phone) {
          phoneLookup[a.contact_name] = a.contact_phone;
        }
      });

      // Get upcoming activities (any future date, not just 7 days)
      let upcoming = allLogs
        .filter(a => {
          const d = new Date(a.activity_date);
          return d >= now;
        })
        .sort((a, b) => new Date(a.activity_date) - new Date(b.activity_date))
        .slice(0, 10);

      // Enrich with phone numbers from activity history AND HubSpot
      upcoming = await Promise.all(upcoming.map(async (a) => {
        let phone = a.contact_phone || phoneLookup[a.contact_email] || phoneLookup[a.contact_name] || '';
        
        // If still no phone, look up in HubSpot
        if (!phone && (a.contact_email || a.contact_name)) {
          try {
            const res = await base44.functions.invoke('searchHubSpotContacts', {
              query: a.contact_email || a.contact_name
            });
            if (res.data?.contacts?.[0]) {
              phone = res.data.contacts[0].phone || '';
            }
          } catch (e) {
            console.error('HubSpot phone lookup failed:', e);
          }
        }
        
        return { ...a, contact_phone: phone };
      }));

      setUpcomingTasks(upcoming);
    } catch (e) {
      // silent
    }
  };

  const goToQueue = () => {
    setIsOpen(false);
    if (currentPath.includes('HubSpotActivityLog') || currentPath.includes('AdminActivityPage')) {
      // Already on the page — dispatch event directly
      window.dispatchEvent(new CustomEvent('switchToQueueTab'));
    } else {
      // Navigate without full refresh
      if (isAdmin) {
        // For admin, set sessionStorage signal and use navigate (no full refresh)
        sessionStorage.setItem('_pendingTabSwitch', 'queue');
        navigate('/AdminActivityPage');
      } else {
        // For sales rep, use navigate with URL param (no full refresh)
        navigate('/HubSpotActivityLog?tab=queue');
      }
    }
  };

  const navigateToQueue = goToQueue;
  const navigateToTask = () => goToQueue();

  const formatTaskDate = (dateStr) => {
    const d = new Date(dateStr);
    if (isToday(d)) return `Today at ${format(d, "h:mm a")}`;
    if (isTomorrow(d)) return `Tomorrow at ${format(d, "h:mm a")}`;
    return format(d, "MMM d 'at' h:mm a");
  };

  const overdueCount = upcomingTasks.filter(t => isPast(new Date(t.activity_date)) && !isToday(new Date(t.activity_date))).length;
  const totalCount = upcomingTasks.length;

  return (
    <>
      {/* Vertical tab on left side */}
      <div
        className="fixed left-0 top-1/2 -translate-y-1/2 z-[9990]"
        style={{ writingMode: 'vertical-rl' }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-2 py-4 rounded-r-lg text-xs font-semibold tracking-widest uppercase transition-all"
          style={{
            backgroundColor: '#1A1A1A',
            color: '#B8956A',
            border: '1px solid rgba(184,149,106,0.3)',
            borderLeft: 'none',
          }}
        >
          {totalCount > 0 && (
            <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold" style={{ backgroundColor: '#B8956A', color: '#1A1A1A', writingMode: 'horizontal-tb' }}>
              {totalCount}
            </span>
          )}
          Tasks
          <Bell className="w-3 h-3" style={{ writingMode: 'horizontal-tb' }} />
        </button>
      </div>

      {/* Slide-out panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9991]"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            className="fixed left-0 top-0 bottom-0 z-[9992] flex flex-col"
            style={{
              width: '320px',
              backgroundColor: '#1A1A1A',
              borderRight: '1px solid rgba(184,149,106,0.3)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: '#B8956A' }} />
                <span className="font-semibold text-sm" style={{ color: '#FFFBF5' }}>Tasks</span>
                {totalCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: 'rgba(184,149,106,0.2)', color: '#B8956A' }}>
                    {totalCount}
                  </span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} style={{ color: 'rgba(255,251,245,0.5)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Section label */}
            {upcomingTasks.length > 0 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,251,245,0.4)' }}>UPCOMING</p>
              </div>
            )}

            {/* Task list */}
            <div className="flex-1 overflow-y-auto">
              {upcomingTasks.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm" style={{ color: 'rgba(255,251,245,0.4)' }}>No upcoming tasks</p>
                </div>
              ) : (
                upcomingTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => navigateToTask(task)}
                    className="w-full text-left px-4 py-3 border-b flex items-start gap-3 transition-colors hover:bg-white/5"
                    style={{ borderColor: 'rgba(255,251,245,0.06)' }}
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg shrink-0" style={{ backgroundColor: 'rgba(184,149,106,0.15)' }}>
                      <Phone className="w-3 h-3" style={{ color: '#B8956A' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#FFFBF5' }}>
                        {task.contact_name || task.company_name || "Unknown"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#B8956A' }}>{formatTaskDate(task.activity_date)}</p>
                      {task.contact_phone && (
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,251,245,0.6)' }}>
                          📞 {task.contact_phone}
                        </p>
                      )}
                      {task.notes && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,251,245,0.4)' }}>
                          {task.notes.replace(/^\[AI Scheduled\]\s*/, '').slice(0, 60)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0" style={{ color: 'rgba(255,251,245,0.3)' }} />
                  </button>
                ))
              )}
            </div>

            {/* Footer button */}
            <div className="p-4 border-t" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
              <button
                onClick={navigateToQueue}
                className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}
              >
                Open Full Call Queue →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}