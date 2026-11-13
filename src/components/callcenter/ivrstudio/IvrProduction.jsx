import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Rocket, RotateCcw, FlaskConical, Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ivrStudio } from "./ivrStudioClient";
import { Card, SectionHead, Field, TextInput, TextArea, Toggle, Pill, Empty } from "./IvrUi";

const DESTINATIONS = ["sales_ring", "support", "applicant", "ashley", "voicemail"];

const GROUPS = [
  {
    key: "public",
    label: "Public menu",
    description:
      "The greeting every unrecognised caller hears and where each keypad option goes. Press 1 and 2 are the original paths; press 3 is the job-applicant path.",
    fields: [
      { p: "settings.greeting_public", l: "Greeting and keypad prompt", t: "text" },
      { p: "prod.public_menu.timeout", l: "Keypad timeout (seconds)", t: "number" },
      { p: "prod.public_menu.options.1", l: "Press 1 →", t: "dest" },
      { p: "prod.public_menu.options.2", l: "Press 2 →", t: "dest" },
      { p: "prod.public_menu.options.3", l: "Press 3 →", t: "dest" },
      { p: "prod.public_menu.invalid_destination", l: "Unrecognised key →", t: "dest" },
      { p: "prod.public_menu.no_input_destination", l: "No input →", t: "dest" },
    ],
  },
  {
    key: "applicant",
    label: "Job applicants",
    description:
      "The greeting a recognised applicant hears on press 3, the line they are transferred to, and the private announcement heard only by the person answering.",
    fields: [
      { p: "prod.applicant.greeting_named", l: "Greeting — recognised applicant", t: "text" },
      { p: "prod.applicant.greeting_unknown", l: "Greeting — unknown caller", t: "text" },
      { p: "prod.applicant.retry_prompt", l: "Repeat prompt", t: "text" },
      { p: "prod.applicant.menu_timeout", l: "Keypad timeout (seconds)", t: "number" },
      { p: "prod.applicant.dial_timeout", l: "Dial timeout (seconds)", t: "number" },
      { p: "prod.applicant.hr_number", l: "Destination number", t: "text", hint: "Blank uses the owner fallback number." },
      { p: "prod.applicant.failure_text", l: "Nobody answered", t: "text" },
      { p: "prod.applicant.whisper_named", l: "Private announcement — recognised applicant", t: "text" },
      { p: "prod.applicant.whisper_unknown", l: "Private announcement — unknown caller", t: "text" },
      { p: "prod.applicant.whisper_voice", l: "Announcement voice", t: "text", hint: "Twilio voice, e.g. Polly.Joanna." },
    ],
  },
  {
    key: "owner",
    label: "Owner line",
    description:
      "Calls from an authorised number reach the dial-out menu instead of the public menu. Add or retune a number here and the production caller handler uses it on the next call.",
    fields: [
      { p: "prod.owner_admin.menu_prompt", l: "Dial-out menu prompt", t: "text" },
      { p: "prod.owner_admin.menu_timeout", l: "Menu timeout (seconds)", t: "number" },
      { p: "prod.owner_admin.dial_prompt", l: "Destination prompt", t: "text" },
      { p: "prod.owner_admin.dial_timeout", l: "Destination timeout (seconds)", t: "number" },
      { p: "prod.owner_admin.invalid_text", l: "Invalid number text", t: "text" },
      { p: "prod.owner_admin.no_entry_text", l: "No number entered text", t: "text" },
      { p: "prod.owner_admin.support_fallback_text", l: "Menu fallback text", t: "text" },
      { p: "prod.owner_admin.outbound_timeout", l: "Outbound call timeout (seconds)", t: "number" },
    ],
    rules: true,
  },
  {
    key: "job",
    label: "Active job",
    description:
      "The two menus played while a job is active: a booked Media Specialist reaching their client, and a client reaching their Media Specialist.",
    fields: [
      { p: "prod.active_job.specialist_prompt", l: "Media Specialist menu", t: "text" },
      { p: "prod.active_job.client_prompt", l: "Client menu", t: "text" },
      { p: "prod.active_job.support_fallback_text", l: "Menu fallback text", t: "text" },
      { p: "prod.active_job.bridge_timeout", l: "Bridge timeout (seconds)", t: "number" },
      { p: "prod.active_job.menu_timeout", l: "Menu timeout (seconds)", t: "number" },
    ],
  },
  {
    key: "recognised",
    label: "Recognised callers",
    description:
      "What each recognised caller type hears. Recognition itself uses your existing records and precedence; the wording, hints and repeat prompts are editable.",
    fields: [
      { p: "settings.greeting_specialist", l: "Media Specialist greeting", t: "text" },
      { p: "prod.specialist.hints", l: "Media Specialist speech hints", t: "text" },
      { p: "prod.specialist.retry_prompt", l: "Media Specialist repeat prompt", t: "text" },
      { p: "prod.specialist.speech_timeout", l: "Media Specialist listen timeout", t: "number" },
      { p: "settings.greeting_client", l: "Client greeting", t: "text" },
      { p: "prod.client.hints", l: "Client speech hints", t: "text" },
      { p: "prod.client.retry_prompt", l: "Client repeat prompt", t: "text" },
      { p: "prod.client.portal_message", l: "Portal guidance", t: "text" },
      { p: "settings.greeting_prospect", l: "Prospect greeting", t: "text" },
      { p: "prod.prospect.dial_timeout", l: "Advisor dial timeout (seconds)", t: "number" },
    ],
  },
  {
    key: "support",
    label: "Support & voicemail",
    description:
      "The support overflow menu, the callback wording and the technical-support voicemail. Ticket creation is unchanged.",
    fields: [
      { p: "settings.support_overflow_text", l: "Overflow menu", t: "text" },
      { p: "prod.support.attempts", l: "Menu retries before voicemail", t: "number" },
      { p: "prod.support.callback_reason_prompt", l: "Callback reason prompt", t: "text" },
      { p: "prod.support.callback_confirm_text", l: "Callback confirmation", t: "text" },
      { p: "settings.tech_support_prompt", l: "Voicemail prompt", t: "text" },
      { p: "prod.support.voicemail_note", l: "No message recorded text", t: "text" },
      { p: "prod.support.voicemail_thanks", l: "Voicemail thanks", t: "text" },
      { p: "settings.voicemail_max_seconds", l: "Voicemail max length (seconds)", t: "number" },
      { p: "settings.voicemail_enabled", l: "Voicemail enabled", t: "toggle" },
      { p: "settings.support_number", l: "Support number", t: "text" },
      { p: "settings.support_timeout", l: "Support dial timeout (seconds)", t: "number" },
    ],
  },
  {
    key: "ring",
    label: "Sales ring & Ashley",
    description:
      "The staged sales ring: primaries, then cellphones, then the owner fallback, then Ashley. Numbers come from your sales team records; timeouts and wording are here.",
    fields: [
      { p: "settings.stage1_timeout", l: "Stage 1 timeout (seconds)", t: "number" },
      { p: "settings.stage2_timeout", l: "Stage 2 timeout (seconds)", t: "number" },
      { p: "settings.stage3_timeout", l: "Stage 3 timeout (seconds)", t: "number" },
      { p: "settings.owner_fallback_number", l: "Owner fallback number", t: "text" },
      { p: "settings.agent_acceptance_required", l: "Ask the answerer to press 1", t: "toggle" },
      { p: "prod.sales_ring.accept_prompt", l: "Acceptance prompt", t: "text" },
      { p: "settings.sales_unavailable_text", l: "Nobody available text", t: "text" },
      { p: "prod.sales_ring.final_no_answer_text", l: "Final no-answer text", t: "text" },
      { p: "settings.ashley_enabled", l: "Ashley answers when nobody picks up", t: "toggle" },
      { p: "settings.ashley_max_turns", l: "Ashley conversation turn limit", t: "number" },
      { p: "settings.ashley_booking_enabled", l: "Ashley may book jobs", t: "toggle" },
    ],
  },
  {
    key: "notify",
    label: "SMS alerts",
    description: "Who is texted when a voicemail, callback or support ticket is created.",
    fields: [
      { p: "settings.notify_number", l: "Alert number", t: "text", hint: "Blank uses the owner fallback number." },
      { p: "settings.notify_owner_on_voicemail", l: "Text on voicemail", t: "toggle" },
      { p: "settings.notify_owner_on_callback", l: "Text on callback", t: "toggle" },
      { p: "settings.notify_owner_on_ticket", l: "Text on ticket", t: "toggle" },
    ],
  },
];

const getPath = (obj, path) => path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

function setPathOn(obj, path, value) {
  const parts = path.split(".");
  const clone = JSON.parse(JSON.stringify(obj || {}));
  let node = clone;
  parts.slice(0, -1).forEach((key) => {
    if (node[key] === undefined || node[key] === null) node[key] = {};
    node = node[key];
  });
  node[parts[parts.length - 1]] = value;
  return clone;
}

export default function IvrProduction() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [group, setGroup] = useState("public");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [testPath, setTestPath] = useState("public");
  const [testInputs, setTestInputs] = useState({ caller_number: "", name: "", first_name: "" });
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    const res = await ivrStudio({ action: "productionGet" });
    if (res?.error) {
      setError(res.error);
      return res;
    }
    setData(res);
    setDraft(res.draft);
    return res;
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e?.message || "Could not load the live IVR configuration."));
  }, [load]);

  const change = (path, value) => setDraft((prev) => setPathOn(prev, path, value));

  const liveValue = (path) => {
    if (!data) return "";
    if (path.startsWith("settings.")) return getPath(data.live_settings, path.slice(9));
    if (path.startsWith("prod.")) return getPath(data.live_prod, path.slice(5));
    return "";
  };

  const pendingChanges = useMemo(() => {
    if (!data || !draft) return 0;
    let count = 0;
    GROUPS.forEach((g) =>
      g.fields.forEach((f) => {
        if (String(getPath(draft, f.p) ?? "") !== String(liveValue(f.p) ?? "")) count += 1;
      })
    );
    const liveRules = getPath(data.live_prod, "owner_admin.phone_rules") || [];
    const draftRules = getPath(draft, "prod.owner_admin.phone_rules") || [];
    if (JSON.stringify(liveRules) !== JSON.stringify(draftRules)) count += 1;
    return count;
  }, [data, draft]);

  const act = async (action, payload = {}, key = action) => {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const res = await ivrStudio({ action, ...payload });
      if (res?.error) setError(res.error);
      return res;
    } finally {
      setBusy("");
    }
  };

  const saveDraft = async () => {
    const res = await act("productionSaveDraft", { draft }, "save");
    if (res?.success) setNotice("Draft saved. Nothing is live until you publish.");
  };

  const publish = async () => {
    const res = await act("productionPublish", { draft, note }, "publish");
    if (res?.success) {
      setNotice(`Published as version ${res.version}. The live caller handler is using it now.`);
      setNote("");
      await load();
    }
  };

  const rollback = async (version) => {
    const res = await act("productionRollback", { version }, `rollback-${version}`);
    if (res?.success) {
      setNotice(`Restored version ${res.restored_from} as version ${res.version}.`);
      await load();
    }
  };

  const discard = async () => {
    const res = await act("productionDiscardDraft", {}, "discard");
    if (res?.success) {
      setDraft(res.draft);
      setNotice("Draft discarded — it now matches what is live.");
    }
  };

  const runTest = async () => {
    const res = await act(
      "productionTest",
      { draft, path: testPath, ...testInputs },
      "test"
    );
    if (!res?.error) setTestResult(res);
  };

  if (!data || !draft) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[#1A1A1A]/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the live IVR configuration…
      </div>
    );
  }

  const activeGroup = GROUPS.find((g) => g.key === group);
  const rules = getPath(draft, "prod.owner_admin.phone_rules") || [];

  const renderField = (f) => {
    const value = getPath(draft, f.p);
    const live = liveValue(f.p);
    const changed = String(value ?? "") !== String(live ?? "");
    const label = changed ? (
      <span className="flex items-center gap-2">
        {f.l} <Pill tone="gold">draft</Pill>
      </span>
    ) : (
      f.l
    );

    if (f.t === "toggle") {
      return (
        <div key={f.p} className="sm:col-span-2">
          <Toggle checked={value} onChange={(v) => change(f.p, v)} label={f.l} />
        </div>
      );
    }
    if (f.t === "dest") {
      return (
        <Field key={f.p} label={label} hint={changed ? `Live: ${live || "—"}` : f.hint}>
          <select
            value={value || ""}
            onChange={(e) => change(f.p, e.target.value)}
            className="h-9 w-full rounded-md border border-[#B8956A]/25 bg-white px-3 text-sm text-[#1A1A1A]"
          >
            {DESTINATIONS.map((d) => (
              <option key={d} value={d}>
                {d.replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      );
    }
    if (f.t === "number") {
      return (
        <Field key={f.p} label={label} hint={changed ? `Live: ${live || "—"}` : f.hint}>
          <TextInput
            type="number"
            value={value ?? ""}
            onChange={(v) => change(f.p, v === "" ? "" : Number(v))}
          />
        </Field>
      );
    }
    return (
      <Field key={f.p} label={label} className="sm:col-span-2" hint={changed ? `Live: ${live || "—"}` : f.hint}>
        <TextArea value={value ?? ""} onChange={(v) => change(f.p, v)} rows={2} />
      </Field>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="border-[#B8956A]/40 bg-[#FFFBF5]">
        <SectionHead
          title="Live IVR"
          description="This is your production telephone system: the same prompts, menus, recognition and routing that answer calls today. Edits stay in a draft until you publish, and publishing needs no code deployment because the live call handlers read this configuration on every call."
          right={<Pill tone={pendingChanges ? "warn" : "live"}>{pendingChanges ? `${pendingChanges} draft change(s)` : "matches live"}</Pill>}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={saveDraft} disabled={busy === "save"}>
            {busy === "save" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Save draft
          </Button>
          <Button
            size="sm"
            className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
            onClick={publish}
            disabled={busy === "publish"}
          >
            {busy === "publish" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Rocket className="mr-1 h-3.5 w-3.5" />}
            Publish to live calls
          </Button>
          <Button size="sm" variant="ghost" onClick={discard} disabled={busy === "discard"} className="text-[#1A1A1A]/60">
            Discard draft
          </Button>
          <span className="text-xs text-[#1A1A1A]/45">
            Version {data.version || 0}
            {data.published_at ? ` · published ${new Date(data.published_at).toLocaleString()}` : " · never published"}
          </span>
        </div>
        {notice ? <p className="mt-2 text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </Card>

      <div className="flex flex-wrap gap-1">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={`rounded-lg px-3 py-1.5 text-[13px] ${
              group === g.key ? "bg-[#1A1A1A] text-[#FFFBF5]" : "text-[#1A1A1A]/65 hover:bg-[#1A1A1A]/5"
            }`}
          >
            {g.label}
          </button>
        ))}
        <button
          onClick={() => setGroup("inventory")}
          className={`rounded-lg px-3 py-1.5 text-[13px] ${
            group === "inventory" ? "bg-[#1A1A1A] text-[#FFFBF5]" : "text-[#1A1A1A]/65 hover:bg-[#1A1A1A]/5"
          }`}
        >
          Where each setting is used
        </button>
        <button
          onClick={() => setGroup("publish")}
          className={`rounded-lg px-3 py-1.5 text-[13px] ${
            group === "publish" ? "bg-[#1A1A1A] text-[#FFFBF5]" : "text-[#1A1A1A]/65 hover:bg-[#1A1A1A]/5"
          }`}
        >
          Test & history
        </button>
      </div>

      {activeGroup ? (
        <Card>
          <SectionHead title={activeGroup.label} description={activeGroup.description} />
          <div className="grid gap-3 sm:grid-cols-2">{activeGroup.fields.map(renderField)}</div>

          {activeGroup.rules ? (
            <div className="mt-5 border-t border-[#B8956A]/20 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1A1A1A]">Authorised phone numbers</p>
                  <p className="text-xs text-[#1A1A1A]/50">
                    Callers from these numbers skip the public menu and get the dial-out menu. Numbers set in the app
                    environment stay authorised either way.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    change("prod.owner_admin.phone_rules", [
                      ...rules,
                      { number: "", label: "", enabled: true, greeting: "", bypass_menu: false, notes: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
              {rules.length ? (
                <div className="space-y-3">
                  {rules.map((rule, index) => (
                    <div key={index} className="rounded-xl border border-[#B8956A]/25 p-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="Number">
                          <TextInput
                            value={rule.number || ""}
                            onChange={(v) => change(`prod.owner_admin.phone_rules.${index}.number`, v)}
                            placeholder="+14047891107"
                          />
                        </Field>
                        <Field label="Label">
                          <TextInput
                            value={rule.label || ""}
                            onChange={(v) => change(`prod.owner_admin.phone_rules.${index}.label`, v)}
                            placeholder="Owner line"
                          />
                        </Field>
                        <Field label="Greeting override" className="sm:col-span-2" hint="Blank plays the dial-out menu prompt above.">
                          <TextArea
                            value={rule.greeting || ""}
                            onChange={(v) => change(`prod.owner_admin.phone_rules.${index}.greeting`, v)}
                            rows={2}
                          />
                        </Field>
                        <Field label="Notes" className="sm:col-span-2">
                          <TextInput
                            value={rule.notes || ""}
                            onChange={(v) => change(`prod.owner_admin.phone_rules.${index}.notes`, v)}
                            placeholder="What this number is and who uses it"
                          />
                        </Field>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <Toggle
                          checked={rule.enabled !== false}
                          onChange={(v) => change(`prod.owner_admin.phone_rules.${index}.enabled`, v)}
                          label="Rule active"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() =>
                            change(
                              "prod.owner_admin.phone_rules",
                              rules.filter((_, i) => i !== index)
                            )
                          }
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No owner numbers configured. Only the environment numbers reach the dial-out menu.</Empty>
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {group === "inventory" ? (
        <Card>
          <SectionHead
            title="Where each setting is used"
            description="Every row is a value a production handler reads on a live call, the function that reads it, and the configuration path that changes it."
          />
          <div className="space-y-2">
            {data.inventory.map((row) => (
              <div key={`${row.group}-${row.label}`} className="rounded-xl border border-[#B8956A]/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-[#B8956A]">
                    {row.group} · {row.label}
                  </p>
                  <Pill tone="info">{row.where}</Pill>
                </div>
                <p className="mt-1 text-sm text-[#1A1A1A]/80">{row.value || "—"}</p>
                <p className="mt-1 text-[11px] text-[#1A1A1A]/40">{row.editable}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {group === "publish" ? (
        <div className="space-y-4">
          <Card>
            <SectionHead
              title="Test the draft"
              description="Runs the same plan builders the live handlers use, against your draft, without placing a call."
            />
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label="Path">
                <select
                  value={testPath}
                  onChange={(e) => setTestPath(e.target.value)}
                  className="h-9 w-full rounded-md border border-[#B8956A]/25 bg-white px-3 text-sm"
                >
                  <option value="public">Public menu</option>
                  <option value="applicant">Job applicant</option>
                  <option value="owner">Owner line</option>
                  <option value="job">Active job</option>
                  <option value="specialist">Media Specialist</option>
                  <option value="client">Client</option>
                  <option value="support">Support</option>
                  <option value="ring">Sales ring</option>
                </select>
              </Field>
              <Field label="Caller number">
                <TextInput
                  value={testInputs.caller_number}
                  onChange={(v) => setTestInputs((p) => ({ ...p, caller_number: v }))}
                  placeholder="+14047891107"
                />
              </Field>
              <Field label="Applicant name">
                <TextInput value={testInputs.name} onChange={(v) => setTestInputs((p) => ({ ...p, name: v }))} />
              </Field>
              <Field label="First name">
                <TextInput
                  value={testInputs.first_name}
                  onChange={(v) => setTestInputs((p) => ({ ...p, first_name: v }))}
                />
              </Field>
            </div>
            <Button size="sm" variant="outline" className="mt-3" onClick={runTest} disabled={busy === "test"}>
              <FlaskConical className="mr-1 h-3.5 w-3.5" /> Run test
            </Button>
            {testResult ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-[#1A1A1A] p-3 text-xs text-[#FFFBF5]">
                {JSON.stringify(testResult.result, null, 2)}
              </pre>
            ) : null}
          </Card>

          <Card>
            <SectionHead
              title="Publish"
              description="Publishing writes this configuration to the live IVR and saves a version you can restore."
            />
            <Field label="Note for this version">
              <TextInput value={note} onChange={setNote} placeholder="Changed public greeting wording" />
            </Field>
            {data.issues?.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {data.issues.map((i, idx) => (
                  <li key={idx} className={i.severity === "error" ? "text-red-600" : "text-amber-700"}>
                    {i.severity === "error" ? "Blocking: " : "Warning: "}
                    {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-emerald-700">No blocking problems in this draft.</p>
            )}
          </Card>

          <Card>
            <SectionHead title="Versions" description="Every publish is kept. Restoring a version also publishes it as a new version." />
            {data.versions?.length ? (
              <div className="space-y-2">
                {data.versions.map((v) => (
                  <div key={v.id || v.version} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#B8956A]/20 p-3">
                    <div>
                      <p className="text-sm text-[#1A1A1A]">
                        Version {v.version}
                        {v.restored_from ? ` · restored from ${v.restored_from}` : ""}
                      </p>
                      <p className="text-xs text-[#1A1A1A]/50">
                        {v.published_by || "admin"} · {v.published_at ? new Date(v.published_at).toLocaleString() : ""}
                        {v.note ? ` · ${v.note}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rollback(v.version)}
                      disabled={busy === `rollback-${v.version}` || v.version === data.version}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No versions published yet.</Empty>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}