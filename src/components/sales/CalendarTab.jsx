import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useSalesDashboardData } from "@/hooks/useSalesDashboardData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, RefreshCw, CheckCircle, XCircle, MapPin, Users, ExternalLink, Pencil } from "lucide-react";
import { format } from "date-fns";

export default function CalendarTab({ salesMemberId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salesMember, setSalesMember] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Fetch profile via backend function (bypasses RLS for sales-authenticated users)
  const { data: dashboardData } = useSalesDashboardData(salesMemberId);

  useEffect(() => {
    if (dashboardData?.profile) {
      setSalesMember(dashboardData.profile);
    }
  }, [dashboardData?.profile]);

  useEffect(() => {
    if (salesMember) loadEvents(salesMember);
  }, [salesMember]);

  const loadEvents = async (memberOverride) => {
    const member = memberOverride || salesMember;
    const userEmail = member?.company_email || member?.email;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getCalendarEvents', { userEmail });
      setEvents(res.data?.events || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try { return format(new Date(dateStr), "MMM d, yyyy h:mm a"); }
    catch { return dateStr; }
  };

  const renderTextWithLinks = (text) => {
    if (!text) return '';
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => 
      urlRegex.test(part) ? 
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#B8956A', textDecoration: 'underline' }}>{part}</a>
      : part
    );
  };

  const getUserRsvp = (event) => {
    const userEmail = salesMember?.company_email || salesMember?.email;
    if (!userEmail) return null;
    const me = event.attendees?.find(a => a.email?.toLowerCase() === userEmail.toLowerCase());
    return me?.responseStatus || null;
  };

  const rsvpLabel = { accepted: 'Accepted', declined: 'Declined', tentative: 'Maybe', needsAction: 'Pending' };
  const rsvpColor = { accepted: '#22c55e', declined: '#ef4444', tentative: '#f59e0b', needsAction: '#6b7280' };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setEditing(false);
    setEditForm({
      summary: event.summary || '',
      description: event.description || '',
      location: event.location || '',
      startDateTime: event.start?.dateTime ? event.start.dateTime.slice(0, 16) : '',
      endDateTime: event.end?.dateTime ? event.end.dateTime.slice(0, 16) : '',
      attendees: (event.attendees || []).map(a => ({ email: a.email, displayName: a.displayName })),
      newAttendeeEmail: '',
    });
  };

  const handleRsvp = async (status) => {
    const userEmail = salesMember?.company_email || salesMember?.email;
    setSaving(true);
    try {
      await base44.functions.invoke('updateCalendarEvent', {
        eventId: selectedEvent.id,
        rsvpStatus: status,
        userEmail
      });
      // Update locally
      setEvents(prev => prev.map(e => {
        if (e.id !== selectedEvent.id) return e;
        const updatedAttendees = (e.attendees || []).map(a =>
          a.email?.toLowerCase() === userEmail?.toLowerCase() ? { ...a, responseStatus: status } : a
        );
        return { ...e, attendees: updatedAttendees };
      }));
      setSelectedEvent(prev => ({
        ...prev,
        attendees: (prev.attendees || []).map(a =>
          a.email?.toLowerCase() === userEmail?.toLowerCase() ? { ...a, responseStatus: status } : a
        )
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const updates = {
        summary: editForm.summary,
        description: editForm.description,
        location: editForm.location,
        attendees: editForm.attendees.map(a => ({ email: a.email, displayName: a.displayName }))
      };
      if (editForm.startDateTime) updates.start = { dateTime: new Date(editForm.startDateTime).toISOString(), timeZone: 'America/New_York' };
      if (editForm.endDateTime) updates.end = { dateTime: new Date(editForm.endDateTime).toISOString(), timeZone: 'America/New_York' };

      const res = await base44.functions.invoke('updateCalendarEvent', {
        eventId: selectedEvent.id,
        updates
      });
      const updated = res.data?.event;
      if (updated) {
        setEvents(prev => prev.map(e => e.id === updated.id ? updated : e));
        setSelectedEvent(updated);
      }
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'rgba(26,26,26,0.6)' }}>Upcoming events from your calendar</p>
        <Button size="sm" variant="outline" onClick={() => loadEvents()} disabled={loading} style={{ borderColor: '#B8956A', color: '#B8956A' }}>
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
          {events.map((event, idx) => {
            const rsvp = getUserRsvp(event);
            return (
              <div
                key={event.id || idx}
                className="rounded-lg border p-4 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: 'rgba(184,149,106,0.25)', backgroundColor: '#fff' }}
                onClick={() => handleEventClick(event)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate" style={{ color: '#1A1A1A' }}>{event.summary || '(No title)'}</p>
                      {rsvp && (
                        <Badge style={{ backgroundColor: rsvpColor[rsvp] + '22', color: rsvpColor[rsvp], border: 'none', fontSize: '11px' }}>
                          {rsvpLabel[rsvp]}
                        </Badge>
                      )}
                    </div>
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
                    <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer"
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: 'rgba(184,149,106,0.15)', color: '#B8956A', whiteSpace: 'nowrap' }}
                      onClick={e => e.stopPropagation()}
                    >
                      Join
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Detail / Edit Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) { setSelectedEvent(null); setEditing(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>{editing ? 'Edit Event' : 'Event Details'}</span>
              {!editing && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && !editing && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: '#1A1A1A' }}>{selectedEvent.summary || '(No title)'}</h3>
                <p className="text-sm mt-1" style={{ color: '#B8956A' }}>
                  {formatTime(selectedEvent.start?.dateTime || selectedEvent.start?.date)}
                  {selectedEvent.end?.dateTime && ` → ${format(new Date(selectedEvent.end.dateTime), "h:mm a")}`}
                </p>
              </div>

              {selectedEvent.description && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm" style={{ color: '#1A1A1A' }}>{renderTextWithLinks(selectedEvent.description)}</p>
                </div>
              )}

              {selectedEvent.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#B8956A' }} />
                  <p className="text-sm" style={{ color: '#1A1A1A' }}>{selectedEvent.location}</p>
                </div>
              )}

              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4" style={{ color: '#B8956A' }} />
                    <p className="text-sm font-medium">Attendees</p>
                  </div>
                  <div className="space-y-1">
                    {selectedEvent.attendees.map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span style={{ color: '#1A1A1A' }}>{a.displayName || a.email}</span>
                        <Badge style={{
                          backgroundColor: (rsvpColor[a.responseStatus] || '#6b7280') + '22',
                          color: rsvpColor[a.responseStatus] || '#6b7280',
                          border: 'none', fontSize: '11px'
                        }}>
                          {rsvpLabel[a.responseStatus] || 'Unknown'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvent.hangoutLink && (
                <a href={selectedEvent.hangoutLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: '#B8956A' }}
                >
                  <ExternalLink className="w-4 h-4" /> Join Meeting
                </a>
              )}

              {/* RSVP buttons */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Your Response</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => handleRsvp('accepted')}
                    className="gap-1 flex-1"
                    style={{
                      backgroundColor: getUserRsvp(selectedEvent) === 'accepted' ? '#22c55e' : '#f0fdf4',
                      color: getUserRsvp(selectedEvent) === 'accepted' ? '#fff' : '#22c55e',
                      border: '1px solid #22c55e'
                    }}
                  >
                    <CheckCircle className="w-4 h-4" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => handleRsvp('tentative')}
                    className="gap-1 flex-1"
                    style={{
                      backgroundColor: getUserRsvp(selectedEvent) === 'tentative' ? '#f59e0b' : '#fffbeb',
                      color: getUserRsvp(selectedEvent) === 'tentative' ? '#fff' : '#f59e0b',
                      border: '1px solid #f59e0b'
                    }}
                  >
                    Maybe
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => handleRsvp('declined')}
                    className="gap-1 flex-1"
                    style={{
                      backgroundColor: getUserRsvp(selectedEvent) === 'declined' ? '#ef4444' : '#fef2f2',
                      color: getUserRsvp(selectedEvent) === 'declined' ? '#fff' : '#ef4444',
                      border: '1px solid #ef4444'
                    }}
                  >
                    <XCircle className="w-4 h-4" /> Decline
                  </Button>
                </div>
                {saving && <p className="text-xs text-center mt-2" style={{ color: 'rgba(26,26,26,0.5)' }}>Saving...</p>}
              </div>
            </div>
          )}

          {selectedEvent && editing && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <Input value={editForm.summary} onChange={e => setEditForm({ ...editForm, summary: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <Input value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })} placeholder="Location" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Start</label>
                  <Input type="datetime-local" value={editForm.startDateTime} onChange={e => setEditForm({ ...editForm, startDateTime: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End</label>
                  <Input type="datetime-local" value={editForm.endDateTime} onChange={e => setEditForm({ ...editForm, endDateTime: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Attendees</label>
                <div className="space-y-2 mb-3">
                  {editForm.attendees && editForm.attendees.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded border" style={{ borderColor: 'rgba(184,149,106,0.2)', backgroundColor: 'rgba(184,149,106,0.05)' }}>
                      <span className="text-sm">{a.displayName || a.email}</span>
                      <button
                        type="button"
                        onClick={() => setEditForm({
                          ...editForm,
                          attendees: editForm.attendees.filter((_, idx) => idx !== i)
                        })}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Add attendee email"
                    value={editForm.newAttendeeEmail}
                    onChange={e => setEditForm({ ...editForm, newAttendeeEmail: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const email = editForm.newAttendeeEmail.trim();
                      if (email && !editForm.attendees.some(a => a.email.toLowerCase() === email.toLowerCase())) {
                        setEditForm({
                          ...editForm,
                          attendees: [...editForm.attendees, { email, displayName: '' }],
                          newAttendeeEmail: ''
                        });
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
                <Button className="flex-1" onClick={handleSaveEdit} disabled={saving} style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}