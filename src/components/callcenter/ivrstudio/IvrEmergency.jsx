import React, { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Pill, SectionHead, TextArea, TextInput } from "./IvrUi";

const MODES = [
  { key: "transfer_all", label: "Send every call to one number", needsNumber: true },
  { key: "greeting_only", label: "Play an emergency greeting, then continue normally" },
  { key: "voicemail_only", label: "Send every call to voicemail" },
  { key: "disable_ai", label: "Disable AI answering (Ashley)" },
  { key: "close_department", label: "Temporarily close a department" },
];

export default function IvrEmergency({ data, act, refresh }) {
  const emergency = data.emergency || null;
  const numbers = data.numbers || [];
  const [form, setForm] = useState({ mode: "transfer_all", target_number: "", greeting_text: "", department: "", reason: "", scope_phone_numbers: [] });
  const [confirmText, setConfirmText] = useState("");
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    act({ action: "audit", limit: 40 }).then((res) => {
      setAudit((res?.entries || []).filter((e) => String(e.action || "").startsWith("emergency")));
    });
  }, [emergency?.active]);

  const mode = MODES.find((m) => m.key === form.mode) || MODES[0];
  const confirmed = confirmText.trim().toUpperCase() === "OVERRIDE";

  return (
    <div className="space-y-3">
      <SectionHead
        title="Emergency Overrides"
        description="For the moments when normal routing must be bypassed immediately. Every override requires confirmation, is written to the audit log, and can be cleared with one action."
      />

      <Card className={emergency?.active ? "border-red-300 bg-red-50" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {emergency?.active ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
            <div>
              <p className="text-sm font-medium text-[#1A1A1A]">
                {emergency?.active ? `Override active — ${emergency.mode}` : "No override is active"}
              </p>
              <p className="text-xs text-[#1A1A1A]/55">
                {emergency?.active
                  ? `${emergency.target_number ? `Calls go to ${emergency.target_number}. ` : ""}${emergency.reason || "No reason recorded."} Activated by ${
                      emergency.activated_by || "an administrator"
                    } ${emergency.activated_at ? `on ${new Date(emergency.activated_at).toLocaleString()}` : ""}.`
                  : "Normal routing is in force on every line."}
              </p>
            </div>
          </div>
          {emergency?.active ? (
            <Button
              className="bg-[#1A1A1A] text-[#FFFBF5]"
              onClick={async () => {
                await act({ action: "emergencyRestore" });
                await refresh();
              }}
            >
              Restore normal routing
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Activate an override</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="What should happen">
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          {mode.needsNumber ? (
            <Field label="Destination number">
              <TextInput value={form.target_number} onChange={(v) => setForm({ ...form, target_number: v })} placeholder="+14047891107" />
            </Field>
          ) : null}
          {form.mode === "close_department" ? (
            <Field label="Department">
              <TextInput value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="Technical support" />
            </Field>
          ) : null}
          <Field label="Reason (recorded in the audit log)">
            <TextInput value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} placeholder="Office closed — storm" />
          </Field>
          <Field label="Applies to" hint="Leave everything unchecked to apply to every line">
            <div className="flex flex-wrap gap-3 pt-2">
              {numbers.map((n) => (
                <label key={n.phone_number} className="flex items-center gap-1 text-xs text-[#1A1A1A]/65">
                  <input
                    type="checkbox"
                    checked={form.scope_phone_numbers.includes(n.phone_number)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scope_phone_numbers: e.target.checked
                          ? [...form.scope_phone_numbers, n.phone_number]
                          : form.scope_phone_numbers.filter((p) => p !== n.phone_number),
                      })
                    }
                  />
                  {n.label || n.phone_number}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Greeting played first" className="mt-3">
          <TextArea
            rows={2}
            value={form.greeting_text}
            onChange={(v) => setForm({ ...form, greeting_text: v })}
            placeholder="Thank you for calling Arriv. Our offices are closed today."
          />
        </Field>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Type OVERRIDE to confirm">
            <TextInput value={confirmText} onChange={setConfirmText} placeholder="OVERRIDE" className="w-40" />
          </Field>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={!confirmed}
            onClick={async () => {
              await act({ action: "emergencyActivate", override: form });
              setConfirmText("");
              await refresh();
            }}
          >
            Activate override
          </Button>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Emergency audit trail</p>
        {!audit.length ? (
          <p className="text-sm text-[#1A1A1A]/45">No emergency action has been taken.</p>
        ) : (
          <div className="space-y-1">
            {audit.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#B8956A]/20 px-2 py-1.5 text-sm">
                <Pill tone={entry.action === "emergency_activate" ? "danger" : "live"}>{entry.action.replace("emergency_", "")}</Pill>
                <span className="text-[#1A1A1A]/75">{entry.summary}</span>
                <span className="ml-auto text-xs text-[#1A1A1A]/45">
                  {entry.actor_email} · {entry.at ? new Date(entry.at).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}