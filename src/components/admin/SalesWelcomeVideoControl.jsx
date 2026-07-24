import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Loader2, Check } from "lucide-react";

export default function SalesWelcomeVideoControl() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("getSalesWelcomeVideoUrl", {});
        setUrl(res.data?.url || "");
      } catch (_e) {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await base44.functions.invoke("setSalesWelcomeVideoUrl", { url: url.trim() });
      if (res.data?.success) setMsg("Saved. New hires will see this video in onboarding.");
      else setMsg(res.data?.error || "Could not save.");
    } catch (e) {
      setMsg(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 bg-white border-2 border-[#B8956A]/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Video className="w-4 h-4 text-[#B8956A]" />
        <h3 className="text-sm font-semibold text-[#1A1A1A]">Sales Onboarding — Welcome Video</h3>
      </div>
      <p className="text-xs text-[#1A1A1A]/60 mb-3">YouTube link shown to accepted sales hires during onboarding (Step 6).</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." disabled={loading || saving} />
        <Button onClick={save} disabled={loading || saving} className="bg-[#B8956A] hover:bg-[#A68559] text-white shrink-0">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save
        </Button>
      </div>
      {msg && <p className="text-xs text-green-600 mt-2">{msg}</p>}
    </div>
  );
}