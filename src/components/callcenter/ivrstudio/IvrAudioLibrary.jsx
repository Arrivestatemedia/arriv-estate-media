import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Play, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Field, Pill, SectionHead, TextArea, TextInput } from "./IvrUi";

export default function IvrAudioLibrary({ data, act, refresh }) {
  const assets = data.assets || [];
  const voices = data.voices || [];
  const [draft, setDraft] = useState({ label: "", text: "", voice_profile_key: "", kind: "tts" });
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadKind, setUploadKind] = useState("recording");

  const addTts = async () => {
    await act({
      action: "saveAsset",
      asset: {
        label: draft.label || "Untitled greeting",
        kind: "tts",
        text: draft.text,
        voice_profile_key: draft.voice_profile_key,
        active: true,
      },
    });
    setDraft({ label: "", text: "", voice_profile_key: "", kind: "tts" });
    await refresh();
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      await act({
        action: "saveAsset",
        asset: {
          label: uploadLabel || file.name,
          kind: uploadKind,
          file_url,
          active: true,
        },
      });
      setUploadLabel("");
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHead
        title="Greetings & Audio Library"
        description="Reusable greetings spoken live from text, plus uploaded recordings and hold music. Text greetings always follow the saved voice, so changing a voice changes every prompt that uses it."
      />

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">New spoken greeting</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name">
            <TextInput value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} placeholder="Public menu greeting" />
          </Field>
          <Field label="Voice">
            <select
              value={draft.voice_profile_key}
              onChange={(e) => setDraft({ ...draft, voice_profile_key: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Number / studio default</option>
              {voices.map((v) => (
                <option key={v.voice_key} value={v.voice_key}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]" disabled={!draft.text.trim()} onClick={addTts}>
              <Plus className="mr-1 h-4 w-4" /> Add greeting
            </Button>
          </div>
        </div>
        <Field label="What is said" className="mt-3">
          <TextArea value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })} placeholder="Thank you for calling Arriv Estate Media." />
        </Field>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium text-[#1A1A1A]">Upload a recording or hold music</p>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Name">
            <TextInput value={uploadLabel} onChange={setUploadLabel} placeholder="Professional hold music" />
          </Field>
          <Field label="Type">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="recording">Greeting recording</option>
              <option value="hold_music">Hold music</option>
            </select>
          </Field>
          <div className="flex items-end">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Choose audio file
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => upload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#1A1A1A]/45">
          Files are stored publicly — anyone with the link can open them — because Twilio must fetch the audio to play it
          to a caller.
        </p>
      </Card>

      <div className="space-y-2">
        {assets.map((asset) => (
          <Card key={asset.asset_key} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-[#1A1A1A]">{asset.label}</p>
                  <Pill tone={asset.kind === "tts" ? "info" : "gold"}>{asset.kind.replace("_", " ")}</Pill>
                </div>
                <p className="truncate text-xs text-[#1A1A1A]/50">
                  {asset.kind === "tts" ? asset.text : asset.file_url}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {asset.file_url ? (
                  <audio controls src={asset.file_url} className="h-8 max-w-[220px]" />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      try {
                        const utter = new SpeechSynthesisUtterance(asset.text || "");
                        utter.lang = "en-US";
                        window.speechSynthesis.speak(utter);
                      } catch (_) {}
                    }}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Preview
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={async () => {
                    await act({ action: "deleteAsset", asset_key: asset.asset_key });
                    await refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}