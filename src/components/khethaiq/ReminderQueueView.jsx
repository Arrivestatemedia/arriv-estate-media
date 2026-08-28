import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Mail, Clock, CheckCircle2, AlertCircle, CalendarClock, Trash2 } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const MUTED_DARK_40 = "rgba(26,26,26,0.4)";
const MUTED_DARK_70 = "rgba(26,26,26,0.7)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "0.75rem",
};

// Convert ET wall-clock (date + HH:MM) to a UTC Date, handling DST.
function etWallToUtc(dateStr, timeStr) {
  if (!dateStr) return null;
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  const month = parseInt(dateStr.slice(5, 7));
  const day = parseInt(dateStr.slice(8, 10));
  let offset = -5; // EST default
  if (month > 3 && month < 11) offset = -4;
  else if (month === 3) {
    const secondSunday = 7 + ((1 - new Date(dateStr + "T12:00:00Z").getUTCDay()) % 7) + 7;
    offset = day >= secondSunday ? -4 : -5;
  } else if (month === 11) {
    const firstSunday = 1 + ((0 - new Date(dateStr + "T12:00:00Z").getUTCDay()) % 7);
    offset = day < firstSunday ? -4 : -5;
  }
  return new Date(Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    month - 1,
    day,
    h,
    m
  ) - offset * 3600 * 1000);
}

function formatEt(date) {
  if (!date) return "";
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function ReminderQueueView() {
  const { toast } = useToast();
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [view, setView] = useState("active"); // "active" | "archived"

  const load = async () => {
    try {
      const res = await base44.entities.Conference.list("-scheduled_date", 200);
      const all = res?.data ?? res ?? [];
      // Only scheduled interviews (not cancelled/completed)
      setConferences(all.filter(c => c.status === "scheduled" && c.meeting_link));
    } catch { setConferences([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (conf) => {
    const applicantName = conf?.participants?.[0]?.name || conf.title || "this interview";
    if (!window.confirm(`Delete this reminder from the queue?\n\n${applicantName}\n\nThis permanently removes the scheduled interview and its reminder. This cannot be undone.`)) return;
    setDeletingId(conf.id);
    try {
      await base44.entities.Conference.delete(conf.id);
      toast({ title: "Reminder deleted", description: `${applicantName} was removed from the queue.` });
      await load();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete", description: err.message || "Unknown error" });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} />
    </div>
  );

  // Build reminder queue entries
  const now = new Date();
  const entries = conferences.map(c => {
    const start = etWallToUtc(c.scheduled_date, c.scheduled_time);
    const target = start ? new Date(start.getTime() - 30 * 60 * 1000) : null;
    const sent = !!c.reminder_30min_sent;
    const past = start && start < now;
    let status, statusColor, statusIcon;
    if (sent) {
      status = "Sent";
      statusColor = GOLD;
      statusIcon = CheckCircle2;
    } else if (target && target > now) {
      status = "Scheduled";
      statusColor = MUTED_DARK_70;
      statusIcon = Clock;
    } else if (past) {
      status = "Missed";
      statusColor = "#DC2626";
      statusIcon = AlertCircle;
    } else {
      status = "Sending soon";
      statusColor = GOLD;
      statusIcon = Mail;
    }
    return { c, start, target, sent, past, status, statusColor, statusIcon };
  }).sort((a, b) => (a.start || 0) - (b.start || 0));

  const upcoming = entries.filter(e => !e.past);
  const archived = entries.filter(e => e.past);

  const activeEntries = view === "active" ? upcoming : archived;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Reminder Queue</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>
          Interview reminder emails — scheduled to send 30 minutes before each interview
        </p>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: "rgba(184,149,106,0.08)" }}>
        <button
          onClick={() => setView("active")}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={view === "active"
            ? { backgroundColor: "#FFFFFF", color: TEXT_DARK, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: MUTED_DARK_70 }}
        >
          Active ({upcoming.length})
        </button>
        <button
          onClick={() => setView("archived")}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={view === "archived"
            ? { backgroundColor: "#FFFFFF", color: TEXT_DARK, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: MUTED_DARK_70 }}
        >
          Archived ({archived.length})
        </button>
      </div>

      {activeEntries.length === 0 ? (
        <div className="text-center py-12" style={whiteCard}>
          <Mail className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>
            {view === "active" ? "No active reminders." : "No archived reminders."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {view === "active" ? (
            activeEntries.map(({ c, start, target, sent, status, statusColor, statusIcon: Icon }) => {
              const applicantName = c.participants?.[0]?.name || c.title || "Interview";
              const applicantEmail = c.participants?.[0]?.email || "";
              return (
                <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={whiteCard}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
                      <h3 className="font-semibold truncate" style={{ ...SERIF, color: TEXT_DARK }}>{applicantName}</h3>
                    </div>
                    {start && (
                      <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>
                        Interview: {formatEt(start)}
                      </p>
                    )}
                    {applicantEmail && (
                      <p className="text-xs mt-0.5" style={{ color: MUTED_DARK_40 }}>{applicantEmail}</p>
                    )}
                    {target && !sent && (
                      <p className="text-xs mt-1" style={{ color: GOLD }}>
                        <Clock className="w-3 h-3 inline mr-1" />
                        Reminder sends: {formatEt(target)}
                      </p>
                    )}
                    {sent && c.reminder_30min_sent_at && (
                      <p className="text-xs mt-1" style={{ color: GOLD }}>
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        Sent: {formatEt(new Date(c.reminder_30min_sent_at))}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ backgroundColor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {status}
                    </span>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}
                    >
                      {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            activeEntries.map(({ c, start, sent, status, statusColor, statusIcon: Icon }) => {
              const applicantName = c.participants?.[0]?.name || c.title || "Interview";
              return (
                <div key={c.id} className="p-3 flex items-center justify-between gap-3 opacity-70" style={whiteCard}>
                  <div className="min-w-0">
                    <h3 className="font-medium truncate text-sm" style={{ color: TEXT_DARK }}>{applicantName}</h3>
                    {start && <p className="text-xs" style={{ color: MUTED_DARK_40 }}>{formatEt(start)}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                    >
                      <Icon className="w-3 h-3" />
                      {status}
                    </span>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}
                    >
                      {deletingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}