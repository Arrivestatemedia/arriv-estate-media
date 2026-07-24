import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, GraduationCap, Check } from "lucide-react";

export default function SalesTrainingVideosControl({ salesMemberId }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getSalesTrainingVideos", {});
      setVideos(res.data?.videos || []);
    } catch (_e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await base44.functions.invoke("setSalesTrainingVideos", { sales_member_id: salesMemberId, videos });
      if (res.data?.success) setMsg("Saved. New hires will see these in the Training tab.");
      else setMsg(res.data?.error || "Could not save.");
    } catch (e) {
      setMsg(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const add = () => setVideos((v) => [...v, { title: "", url: "" }]);
  const remove = (i) => setVideos((v) => v.filter((_, idx) => idx !== i));
  const update = (i, field, val) => setVideos((v) => v.map((x, idx) => idx === i ? { ...x, [field]: val } : x));

  return (
    <div className="mb-6 bg-white border-2 border-[#B8956A]/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <GraduationCap className="w-4 h-4 text-[#B8956A]" />
        <h3 className="text-sm font-semibold text-[#1A1A1A]">Sales Onboarding — Training Videos</h3>
      </div>
      <p className="text-xs text-[#1A1A1A]/60 mb-3">These appear in the Training tab of the Arriv sales system, where new hires land after finishing onboarding.</p>

      {loading ? (
        <div className="flex items-center text-xs text-[#1A1A1A]/50"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</div>
      ) : (
        <div className="space-y-2">
          {videos.map((v, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2">
              <Input value={v.title} onChange={(e) => update(i, "title", e.target.value)} placeholder="Title (e.g. Week 1 — Cold Calling Basics)" className="sm:w-1/2" />
              <div className="flex gap-2 flex-1">
                <Input value={v.url} onChange={(e) => update(i, "url", e.target.value)} placeholder="YouTube URL" className="flex-1" />
                <Button variant="outline" size="icon" onClick={() => remove(i)} className="border-red-200 text-red-500 hover:bg-red-50 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={add} className="border-[#B8956A]/40 text-[#B8956A]">
            <Plus className="w-4 h-4 mr-2" /> Add Training Video
          </Button>
        </div>
      )}

      <div className="flex items-center gap-3 mt-3">
        <Button onClick={save} disabled={saving || loading} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save Training Videos
        </Button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
    </div>
  );
}