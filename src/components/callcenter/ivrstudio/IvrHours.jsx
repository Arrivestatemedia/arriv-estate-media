import React, { useEffect, useState } from "react";
import { Clock, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, Field, SectionHead, TextInput } from "./IvrUi";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function IvrHours({ data, act, refresh }) {
  const schedules = data.schedules || [];
  const flows = data.flows || [];
  const [scheduleKey, setScheduleKey] = useState(schedules[0]?.schedule_key || "");
  const schedule = schedules.find((s) => s.schedule_key === scheduleKey) || schedules[0] || null;
  const [draft, setDraft] = useState(schedule);

  useEffect(() => setDraft(schedule), [scheduleKey, data.schedules]);

  if (!schedules.length) return <Empty>Import your configuration first to edit business hours.</Empty>;

  const weekly = Array.isArray(draft?.weekly) ? draft.weekly : [];
  const patchDay = (day, changes) =>
    setDraft({
      ...draft,
      weekly: DAYS.map((_, index) =>
        index === day ? { ...(weekly.find((w) => Number(w.day) === day) || { day }), ...changes } : weekly.find((w) => Number(w.day) === index) || { day: index, closed: true }
      ),
    });

  const dayOf = (day) => weekly.find((w) => Number(w.day) === day) || { day, closed: true, open: "09:00", close: "17:00" };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Business Hours & Holidays"
        description="Hours decide which branch a call takes at a Business Hours node, and which flow an after-hours call uses. Times are in the schedule's own timezone."
        right={
          <div className="flex gap-2">
            <select
              value={scheduleKey}
              onChange={(e) => setScheduleKey(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              {schedules.map((s) => (
                <option key={s.schedule_key} value={s.schedule_key}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const key = `sch_${Date.now().toString(36)}`;
                await act({
                  action: "saveSchedule",
                  schedule: {
                    schedule_key: key,
                    name: "New schedule",
                    timezone: "America/New_York",
                    weekly: DAYS.map((_, day) => ({ day, closed: day === 0 || day === 6, open: "09:00", close: "17:00" })),
                    holidays: [],
                  },
                });
                await refresh();
                setScheduleKey(key);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> New schedule
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Schedule name">
            <TextInput value={draft?.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          </Field>
          <Field label="Timezone">
            <TextInput value={draft?.timezone} onChange={(v) => setDraft({ ...draft, timezone: v })} />
          </Field>
          <Field label="After-hours flow">
            <select
              value={draft?.after_hours_flow_key || ""}
              onChange={(e) => setDraft({ ...draft, after_hours_flow_key: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">None — stay in the same flow</option>
              {flows.map((f) => (
                <option key={f.flow_key} value={f.flow_key}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          {DAYS.map((dayName, day) => {
            const row = dayOf(day);
            return (
              <div key={dayName} className="grid grid-cols-[110px_90px_1fr_1fr] items-center gap-2">
                <span className="text-sm text-[#1A1A1A]/70">{dayName}</span>
                <label className="flex items-center gap-1 text-xs text-[#1A1A1A]/60">
                  <input
                    type="checkbox"
                    checked={!row.closed}
                    onChange={(e) => patchDay(day, { closed: !e.target.checked })}
                  />
                  open
                </label>
                <TextInput value={row.open} onChange={(v) => patchDay(day, { open: v })} placeholder="09:00" />
                <TextInput value={row.close} onChange={(v) => patchDay(day, { close: v })} placeholder="17:00" />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <p className="mb-2 flex items-center gap-1 text-sm font-medium text-[#1A1A1A]">
          <Clock className="h-4 w-4" /> Holidays and exceptions
        </p>
        <div className="space-y-2">
          {(draft?.holidays || []).map((holiday, index) => (
            <div key={index} className="grid grid-cols-[130px_1fr_80px_1fr_1fr_36px] items-center gap-2">
              <TextInput
                value={holiday.date}
                onChange={(v) =>
                  setDraft({ ...draft, holidays: draft.holidays.map((h, i) => (i === index ? { ...h, date: v } : h)) })
                }
                placeholder="2026-12-25"
              />
              <TextInput
                value={holiday.label}
                onChange={(v) =>
                  setDraft({ ...draft, holidays: draft.holidays.map((h, i) => (i === index ? { ...h, label: v } : h)) })
                }
                placeholder="Christmas Day"
              />
              <label className="flex items-center gap-1 text-xs text-[#1A1A1A]/60">
                <input
                  type="checkbox"
                  checked={!!holiday.closed}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      holidays: draft.holidays.map((h, i) => (i === index ? { ...h, closed: e.target.checked } : h)),
                    })
                  }
                />
                closed
              </label>
              <TextInput
                value={holiday.open}
                onChange={(v) =>
                  setDraft({ ...draft, holidays: draft.holidays.map((h, i) => (i === index ? { ...h, open: v } : h)) })
                }
                placeholder="open"
              />
              <TextInput
                value={holiday.close}
                onChange={(v) =>
                  setDraft({ ...draft, holidays: draft.holidays.map((h, i) => (i === index ? { ...h, close: v } : h)) })
                }
                placeholder="close"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDraft({ ...draft, holidays: draft.holidays.filter((_, i) => i !== index) })}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({ ...draft, holidays: [...(draft?.holidays || []), { date: "", label: "", closed: true }] })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add holiday
          </Button>
        </div>

        <Button
          className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
          onClick={async () => {
            await act({ action: "saveSchedule", schedule: draft });
            await refresh();
          }}
        >
          <Save className="mr-1 h-4 w-4" /> Save hours
        </Button>
      </Card>
    </div>
  );
}