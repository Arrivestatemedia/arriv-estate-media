import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ivrStudio } from "./ivrStudioClient";
import IvrOverview from "./IvrOverview";
import IvrFlowBuilder from "./IvrFlowBuilder";
import IvrNumbers from "./IvrNumbers";
import IvrVoiceStudio from "./IvrVoiceStudio";
import IvrAudioLibrary from "./IvrAudioLibrary";
import IvrCallerRules from "./IvrCallerRules";
import IvrRouting from "./IvrRouting";
import IvrHours from "./IvrHours";
import IvrNodeSettingsPanel from "./IvrNodeSettingsPanel";
import IvrVoicemail from "./IvrVoicemail";
import IvrAshley from "./IvrAshley";
import IvrAnalytics from "./IvrAnalytics";
import IvrTesting from "./IvrTesting";
import IvrVersions from "./IvrVersions";
import IvrEmergency from "./IvrEmergency";
import IvrGlobal from "./IvrGlobal";
import IvrInventory from "./IvrInventory";
import { Card } from "./IvrUi";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "builder", label: "Visual Flow Builder" },
  { key: "numbers", label: "Phone Numbers" },
  { key: "voices", label: "Voice Studio" },
  { key: "audio", label: "Greetings & Audio" },
  { key: "rules", label: "Caller Recognition & Rules" },
  { key: "menus", label: "Menus & Extensions" },
  { key: "routing", label: "Routing & Ring Groups" },
  { key: "hours", label: "Business Hours" },
  { key: "queues", label: "Queues & Hold Music" },
  { key: "voicemail", label: "Voicemail" },
  { key: "ashley", label: "AI Concierge" },
  { key: "analytics", label: "Call History & Analytics" },
  { key: "testing", label: "Testing & Diagnostics" },
  { key: "versions", label: "Versions & Publishing" },
  { key: "emergency", label: "Emergency Overrides" },
  { key: "inventory", label: "Configuration Inventory" },
  { key: "global", label: "Global Settings" },
];

export default function IvrStudio() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await ivrStudio({ action: "bootstrap" });
    if (res?.error) setError(res.error);
    else setData(res);
    return res;
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e?.message || "Could not load the IVR studio."));
  }, [refresh]);

  const act = useCallback(async (payload) => {
    setBusy(true);
    setError("");
    try {
      const res = await ivrStudio(payload);
      if (res?.error) setError(res.error);
      return res;
    } finally {
      setBusy(false);
    }
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[#1A1A1A]/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Arriv Call Center configuration…
      </div>
    );
  }

  const shared = { data, act, refresh, go: setSection };
  const sectionLabel = SECTIONS.find((s) => s.key === section)?.label || "";

  return (
    <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                section === item.key
                  ? "bg-[#1A1A1A] text-[#FFFBF5]"
                  : "text-[#1A1A1A]/65 hover:bg-[#1A1A1A]/5"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-[#B8956A]">{sectionLabel}</p>
          <div className="flex items-center gap-2">
            {busy ? (
              <span className="flex items-center text-xs text-[#1A1A1A]/45">
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Working…
              </span>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => refresh()} className="text-[#1A1A1A]/60">
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!data.seeded ? (
          <Card className="mb-4 border-[#B8956A]/40 bg-[#FFFBF5]">
            <p className="text-sm text-[#1A1A1A]/75">
              The studio has not imported your current configuration yet. Importing creates editable records for the
              flows, voices, business hours, numbers and recognition rules that run today. Nothing goes live: your
              existing production routing keeps answering every call until you deliberately bind a published flow.
            </p>
            <Button
              className="mt-3 bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
              onClick={async () => {
                await act({ action: "seedFromCurrent" });
                await refresh();
              }}
            >
              Import current configuration
            </Button>
          </Card>
        ) : null}

        {section === "overview" && <IvrOverview {...shared} />}
        {section === "builder" && <IvrFlowBuilder {...shared} />}
        {section === "numbers" && <IvrNumbers {...shared} />}
        {section === "voices" && <IvrVoiceStudio {...shared} />}
        {section === "audio" && <IvrAudioLibrary {...shared} />}
        {section === "rules" && <IvrCallerRules {...shared} />}
        {section === "menus" && (
          <IvrNodeSettingsPanel
            {...shared}
            title="Menus & Extensions"
            description="Every spoken menu instruction and the destination bound to each keypad option. Changing the wording here changes what the caller hears, and the destination beside it is what actually happens."
            types={["ivr_menu", "gather_keypad", "gather_speech", "transfer_extension"]}
          />
        )}
        {section === "routing" && <IvrRouting {...shared} />}
        {section === "hours" && <IvrHours {...shared} />}
        {section === "queues" && (
          <IvrNodeSettingsPanel
            {...shared}
            title="Queues & Hold Music"
            description="Queue prompts, hold music and what happens when a caller gives up waiting."
            types={["queue", "play_hold_music"]}
          />
        )}
        {section === "voicemail" && <IvrVoicemail {...shared} />}
        {section === "ashley" && <IvrAshley {...shared} />}
        {section === "analytics" && <IvrAnalytics {...shared} />}
        {section === "testing" && <IvrTesting {...shared} />}
        {section === "versions" && <IvrVersions {...shared} />}
        {section === "emergency" && <IvrEmergency {...shared} />}
        {section === "inventory" && <IvrInventory {...shared} />}
        {section === "global" && <IvrGlobal {...shared} />}
      </div>
    </div>
  );
}