import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export default function CalendarTab({ salesMemberId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salesMember, setSalesMember] = useState(null);

  useEffect(() => {
    if (salesMemberId) {
      base44.entities.SalesTeamMember.get(salesMemberId).then(member => {
        setSalesMember(member);
      }).catch(() => {});
    }
  }, [salesMemberId]);

  useEffect(() => {
    if (salesMember) loadEvents();
  }, [salesMember]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getCalendarEvents', {
        userEmail: salesMember?.company_email || salesMember?.email
      });
      setEvents(res.data?.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), "MMM d, yyyy h:mm a");
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Upcoming events from your calendar</p>
        <Button size="sm" variant="outline" onClick={loadEvents} disabled={loading} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#B8956A' }} />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'rgba(26,26,26,0.4)' }}>
          <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>No upcoming events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, idx) => (
            <div key={event.id || idx} className="rounded-lg border p-4" style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: '#fff' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{event.summary || '(No title)'}</p>
                  <p className="text-xs mt-1" style={{ color: '#B8956A' }}>
                    {formatTime(event.start?.dateTime || event.start?.date)}
                    {event.end?.dateTime && ` → ${format(new Date(event.end.dateTime), "h:mm a")}`}
                  </p>
                  {event.location && (
                    <p className="text-xs mt-1 truncate" style={{ color: 'rgba(26,26,26,0.5)' }}>📍 {event.location}</p>
                  )}
                  {event.attendees && event.attendees.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: 'rgba(26,26,26,0.5)' }}>
                      👥 {event.attendees.map(a => a.email).join(', ')}
                    </p>
                  )}
                </div>
                {event.hangoutLink && (
                  <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', whiteSpace: 'nowrap' }}>
                    Join
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}