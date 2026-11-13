import React, { useState } from "react";
import { Play, Plus, Save, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Pill, SectionHead, TextInput, TextArea } from "./IvrUi";

const SAMPLE =
  "Thank you for calling Arriv Estate Media. To book media for your property, press 1. For support, press 2.";

const VOICE_CHOICES = [
  { id: "Polly.Joanna", provider: "polly", label: "Polly · Joanna (US female)" },
  { id: "Polly.Matthew", provider: "polly", label: "Polly · Matthew (US male)" },
  { id: "Polly.Salli", provider: "polly", label: "Polly · Salli (US female)" },
  { id: "Polly.Danielle", provider: "polly", label: "Polly · Danielle (US female)" },
  { id: "Polly.Stephen", provider: "polly", label: "Polly · Stephen (US male)" },
  { id: "Google.en-US-Neural2-F", provider: "google", label: "Google · Neural2 F (US female)" },
  { id: "Google.en-US-Neural2-D", provider: "google", label: "Google · Neural2 D (US male)" },
  { id: "Google.en-US-Wavenet-F", provider: "google", label: "Google · WaveNet F (US female)" },
  { id: "alice", provider: "twilio", label: "Twilio · Alice (basic)" },
  { id: "man", provider: "twilio", label: "Twilio · Man (basic)" },
];

function preview(voice) {
  try {
    const utter = new SpeechSynthesisUtterance(SAMPLE);
    utter.lang = voice.language || "en-US";
    utter.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (_) {
    /* preview is a convenience only */
  }
}

export default function IvrVoiceStudio({ data, act, refresh }) {
  const voices = data.voices || [];
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);
  const [newVoice, setNewVoice] = useState({ name: "", voice_id: "Polly.Joanna", language: "en-US" });

  const patch = (key, changes) => setDrafts((all) => ({ ...all, [key]: { ...(all[key] || {}), ...changes } }));

  return (
    <div className="space-y-3">
      <SectionHead
        title="Voice Studio"
        description="The voice saved here is the voice a caller actually hears — the flow engine speaks every prompt with it. Preview talks through this browser as an approximation; the live call uses the provider voice."
        right={
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New voice
          </Button>
        }
      />

      {adding ? (
        <Card className="border-[#B8956A]/40">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Name">
              <TextInput value={newVoice.name} onChange={(v) => setNewVoice({ ...newVoice, name: v })} placeholder="Arriv brand voice" />
            </Field>
            <Field label="Provider voice">
              <select
                value={newVoice.voice_id}
                onChange={(e) => {
                  const choice = VOICE_CHOICES.find((c) => c.id === e.target.value);
                  setNewVoice({
                    ...newVoice,
                    voice_id: e.target.value,
                    provider: choice?.provider || "polly",
                    name: newVoice.name || choice?.label || "",
                  });
                }}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                {VOICE_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Language">
              <TextInput value={newVoice.language} onChange={(v) => setNewVoice({ ...newVoice, language: v })} />
            </Field>
            <div className="flex items-end">
              <Button
                className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
                disabled={!newVoice.name.trim()}
                onClick={async () => {
                  await act({
                    action: "saveVoice",
                    voice: {
                      ...newVoice,
                      provider: newVoice.provider || "polly",
                      active: true,
                      additional_cost_cents: newVoice.provider === "google" ? 0 : 0,
                      cost_note:
                        newVoice.provider === "google"
                          ? "Google voices bill at Twilio's Google voice rate per minute."
                          : "Included in the Twilio voice price.",
                    },
                  });
                  setAdding(false);
                  setNewVoice({ name: "", voice_id: "Polly.Joanna", language: "en-US" });
                  await refresh();
                }}
              >
                Save voice
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {voices.map((voice) => {
        const draft = { ...voice, ...(drafts[voice.voice_key] || {}) };
        return (
          <Card key={voice.voice_key}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-medium text-[#1A1A1A]">{voice.name}</p>
                {voice.is_default ? <Pill tone="gold">studio default</Pill> : null}
                {voice.active === false ? <Pill tone="neutral">inactive</Pill> : null}
                {voice.provider === "google" ? <Pill tone="info">Google voice</Pill> : null}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => preview(draft)}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Preview
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    for (const other of voices) {
                      if (other.voice_key !== voice.voice_key && other.is_default) {
                        await act({ action: "saveVoice", voice: { ...other, is_default: false } });
                      }
                    }
                    await act({ action: "saveVoice", voice: { ...draft, is_default: true } });
                    await refresh();
                  }}
                >
                  <Star className="mr-1 h-3.5 w-3.5" /> Make default
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await act({ action: "saveVoice", voice: draft });
                    await refresh();
                  }}
                >
                  <Save className="mr-1 h-3.5 w-3.5" /> Save
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Name">
                <TextInput value={draft.name} onChange={(v) => patch(voice.voice_key, { name: v })} />
              </Field>
              <Field label="Provider voice">
                <select
                  value={draft.voice_id}
                  onChange={(e) => patch(voice.voice_key, { voice_id: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                >
                  {VOICE_CHOICES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                  <option value={draft.voice_id}>{draft.voice_id}</option>
                </select>
              </Field>
              <Field label="Language / locale">
                <TextInput value={draft.language} onChange={(v) => patch(voice.voice_key, { language: v })} />
              </Field>
              <Field label="Fallback voice" hint="Used if the provider is unavailable">
                <TextInput
                  value={draft.fallback_voice_id}
                  onChange={(v) => patch(voice.voice_key, { fallback_voice_id: v })}
                  placeholder="Polly.Joanna"
                />
              </Field>
              <Field label="Extra provider cost" hint="Shown before activation; 0 means no added cost">
                <TextInput
                  value={draft.additional_cost_cents ?? 0}
                  onChange={(v) => patch(voice.voice_key, { additional_cost_cents: Number(v) || 0 })}
                />
              </Field>
              <Field label="Pronunciation overrides" hint="One per line: Arriv=Arrive" className="md:col-span-2">
                <TextArea
                  rows={2}
                  value={(draft.pronunciation || []).map((p) => `${p.word}=${p.replacement}`).join("\n")}
                  onChange={(v) =>
                    patch(voice.voice_key, {
                      pronunciation: v
                        .split("\n")
                        .map((line) => line.split("="))
                        .filter((parts) => parts[0]?.trim())
                        .map((parts) => ({ word: parts[0].trim(), replacement: (parts[1] || parts[0]).trim() })),
                    })
                  }
                  placeholder="Arriv=Arrive"
                />
              </Field>
            </div>
            {draft.cost_note ? <p className="mt-2 text-xs text-[#1A1A1A]/50">{draft.cost_note}</p> : null}
          </Card>
        );
      })}
    </div>
  );
}