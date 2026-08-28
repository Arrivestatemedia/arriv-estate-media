import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Mail, Clock, CheckCircle2, AlertCircle, CalendarClock } from "lucide-react";

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
// ET is UTC-5 (EST) or UTC-4 (EDT).
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
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);

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
      // Within the 30-min window, should send imminently
      status = "Sending soon";
      statusColor = GOLD;
      statusIcon = Mail;
    }
    return { c, start, target, sent, status, statusColor, statusIcon };
  }).sort((a, b) => (a.start || 0) - (b.start || 0));

  const upcoming = entries.filter(e => !e.past);
  const pastEntries = entries.filter(e => e.past);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Reminder Queue</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>
          Interview reminder emails — scheduled to send 30 minutes before each interview
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12" style={whiteCard}>
          <Mail className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No scheduled interviews with reminders.</p>
        </div>
      ) : (
        <>
          {/* Upcoming */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: MUTED_DARK_70 }}>
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm" style={{ color: MUTED_DARK_40 }}>No upcoming interviews.</p>
            ) : (
              upcoming.map(({ c, start, target, sent, status, statusColor, statusIcon: Icon }) => {
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
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Past (sent or missed) */}
          {pastEntries.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: MUTED_DARK_70 }}>
                Past ({pastEntries.length})
              </h2>
              {pastEntries.map(({ c, start, sent, status, statusColor, statusIcon: Icon }) => {
                const applicantName = c.participants?.[0]?.name || c.title || "Interview";
                return (
                  <div key={c.id} className="p-3 flex items-center justify-between gap-3 opacity-70" style={whiteCard}>
                    <div className="min-w-0">
                      <h3 className="font-medium truncate text-sm" style={{ color: TEXT_DARK }}>{applicantName}</h3>
                      {start && <p className="text-xs" style={{ color: MUTED_DARK_40 }}>{formatEt(start)}</p>}
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                    >
                      <Icon className="w-3 h-3" />
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}