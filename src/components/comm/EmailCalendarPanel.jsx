import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { empComm } from '@/lib/empCommClient';

const gold = '#B8956A';

const monthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const monthEnd = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1);
const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * The employee's own calendar, browsable month by month across the whole
 * calendar — not just the weeks ahead. Every event is created as the employee:
 * an invitation never goes out from anyone else's calendar.
 */
export default function EmailCalendarPanel({ memberId }) {
  const [cursor, setCursor] = useState(() => monthStart(new Date()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');

  const load = async (month = cursor) => {
    if (!memberId) return;
    setLoading(true);
    setError('');
    try {
      const data = await empComm.calendar({
        memberId,
        timeMin: monthStart(month).toISOString(),
        timeMax: monthEnd(month).toISOString(),
        limit: 50,
      });
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Your calendar could not be loaded.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, cursor]);

  const shiftMonth = (delta) => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  const create = async () => {
    if (!form?.title || !form?.start_at || !form?.end_at) {
      setError('Add a title, start and end time.');
      return;
    }
    if (!window.confirm(`Send this invitation to ${form.attendees || 'the attendee'}?`)) return;
    setBusy('create');
    setError('');
    try {
      await empComm.createEvent({
        memberId,
        title: form.title,
        description: form.description,
        location: form.location,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
        attendees: String(form.attendees || '')
          .split(',')
          .map((email) => email.trim())
          .filter(Boolean),
        confirmed: true,
      });
      // Show the month the new meeting landed in.
      const created = monthStart(new Date(form.start_at));
      setForm(null);
      if (sameMonth(created, cursor)) {
        await load(cursor);
      } else {
        setCursor(created);
      }
    } catch (err) {
      setError(err.message || 'The meeting could not be created.');
    } finally {
      setBusy('');
    }
  };

  const cancelEvent = async (event) => {
    if (!window.confirm(`Cancel “${event.title}” and notify attendees?`)) return;
    setBusy(event.provider_event_id);
    try {
      await empComm.cancelEvent({ memberId, eventId: event.provider_event_id });
      await load(cursor);
    } catch (err) {
      setError(err.message || 'The meeting could not be cancelled.');
    } finally {
      setBusy('');
    }
  };

  const ordered = [...events].sort(
    (a, b) => new Date(a.start_at || 0).getTime() - new Date(b.start_at || 0).getTime()
  );
  const days = ordered.reduce((groups, event) => {
    const key = event.start_at ? new Date(event.start_at).toDateString() : 'Undated';
    const group = groups.find((item) => item.key === key);
    if (group) group.events.push(event);
    else groups.push({ key, label: key === 'Undated' ? 'Undated' : new Date(event.start_at).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }), events: [event] });
    return groups;
  }, []);
  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const onCurrentMonth = sameMonth(cursor, new Date());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[130px] text-center text-sm font-medium" style={{ color: '#1A1A1A' }}>{monthLabel}</p>
          <Button size="sm" variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!onCurrentMonth && (
            <Button size="sm" variant="ghost" className="text-[11px]" style={{ color: gold }} onClick={() => setCursor(monthStart(new Date()))}>
              This month
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => setForm({ title: '', start_at: '', end_at: '', attendees: '', location: '', description: '' })} className="gap-1.5" style={{ backgroundColor: gold, color: '#1A1A1A' }}>
          <Plus className="h-4 w-4" /> New meeting
        </Button>
      </div>

      <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.5)' }}>Your connected calendar · every meeting, past and upcoming.</p>

      {form && (
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.3)' }}>
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-9 text-sm" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="mt-1 h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Attendees (comma separated)</Label>
            <Input value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="name@company.com" className="mt-1 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={create} disabled={busy === 'create'} style={{ backgroundColor: gold, color: '#1A1A1A' }}>
              {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm & invite'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(26,26,26,0.45)' }}>
            The invitation is sent from your connected calendar after you confirm.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: 'rgba(26,26,26,0.55)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Loading {monthLabel}…
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.key} className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(26,26,26,0.45)' }}>{day.label}</p>
              {day.events.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 rounded-lg border p-3" style={{ borderColor: 'rgba(184,149,106,0.2)' }}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: '#1A1A1A' }}>
                      {event.title}
                      {event.status === 'cancelled' && <Badge variant="outline" className="ml-2 text-[10px]">cancelled</Badge>}
                    </p>
                    <p className="text-xs" style={{ color: 'rgba(26,26,26,0.55)' }}>
                      {event.start_at ? new Date(event.start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                      {event.end_at ? ` – ${new Date(event.end_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                      {event.location ? ` · ${event.location}` : ''}
                    </p>
                    {event.attendees?.length > 0 && (
                      <p className="mt-1 truncate text-[11px]" style={{ color: 'rgba(26,26,26,0.45)' }}>
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        {event.attendees.map((a) => a.email).join(', ')}
                      </p>
                    )}
                  </div>
                  {event.status !== 'cancelled' && (
                    <Button size="sm" variant="ghost" onClick={() => cancelEvent(event)} disabled={busy === event.provider_event_id} className="shrink-0 gap-1 text-red-600">
                      {busy === event.provider_event_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ))}
          {!ordered.length && (
            <p className="py-6 text-center text-sm" style={{ color: 'rgba(26,26,26,0.45)' }}>
              <CalendarDays className="mx-auto mb-2 h-6 w-6 opacity-40" />
              No meetings in {monthLabel}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}