import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Sparkles, BookOpen, Wand2 } from "lucide-react";

const SOURCE_OPTIONS = [
  { value: "bible", label: "Bible" },
  { value: "quran", label: "Quran" },
  { value: "torah", label: "Torah / Tanakh" },
  { value: "buddhist", label: "Buddhist Teachings" },
  { value: "hindu", label: "Hindu Texts" },
  { value: "secular", label: "Secular / No Religious Source" },
];

export default function CultureManager() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMsg, setNewMsg] = useState("");
  const [newVerseRef, setNewVerseRef] = useState("");
  const [newVerseText, setNewVerseText] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [cultureSource, setCultureSource] = useState("bible");
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("manageCultureMessages", { action: "list" });
      setMessages(res.data.messages || []);
      const aiRes = await base44.functions.invoke("manageCultureMessages", { action: "getAiSetting" });
      setAiEnabled(aiRes.data.ai_enabled);
      const srcRes = await base44.functions.invoke("manageCultureMessages", { action: "getCultureSource" });
      setCultureSource(srcRes.data.source || "bible");
    } catch (e) { console.error(e); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newMsg.trim()) return;
    try {
      await base44.functions.invoke("manageCultureMessages", {
        action: "create",
        message: newMsg,
        verse_reference: newVerseRef,
        verse_text: newVerseText,
      });
      setNewMsg(""); setNewVerseRef(""); setNewVerseText("");
      load();
    } catch (e) { console.error(e); }
  }

  async function toggle(id, active) {
    try { await base44.functions.invoke("manageCultureMessages", { action: "update", id, active }); load(); }
    catch (e) { console.error(e); }
  }

  async function remove(id) {
    try { await base44.functions.invoke("manageCultureMessages", { action: "delete", id }); load(); }
    catch (e) { console.error(e); }
  }

  async function toggleAi(enabled) {
    try {
      await base44.functions.invoke("manageCultureMessages", { action: "setAiSetting", ai_enabled: enabled });
      setAiEnabled(enabled);
      if (enabled) load();
    } catch (e) { console.error(e); }
  }

  async function changeSource(value) {
    setCultureSource(value);
    try { await base44.functions.invoke("manageCultureMessages", { action: "setCultureSource", source: value }); }
    catch (e) { console.error(e); }
  }

  async function generateNow() {
    setGenerating(true);
    try { await base44.functions.invoke("manageCultureMessages", { action: "generateNow" }); load(); }
    catch (e) { console.error(e); }
    setGenerating(false);
  }

  return (
    <div className="bg-white border border-[#2563EB]/15 rounded-xl p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-[#2563EB]" /> Culture Messages
      </h3>

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg mb-4">
        <div>
          <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-[#2563EB]" /> AI-Generated Daily Verse
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Auto-generates a motivational quote + verse each day</p>
        </div>
        <Switch checked={aiEnabled} onCheckedChange={toggleAi} />
      </div>

      {aiEnabled && (
        <div className="mb-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase mb-1 block">Default Wisdom Source (new reps)</label>
            <Select value={cultureSource} onValueChange={changeSource}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generateNow} disabled={generating} variant="outline" className="w-full border-[#2563EB]/30 text-[#2563EB]">
            <Wand2 className="w-4 h-4 mr-2" />
            {generating ? "Generating..." : "Generate Now"}
          </Button>
          <p className="text-xs text-slate-400 text-center">A new message is also auto-generated daily at midnight</p>
        </div>
      )}

      {!aiEnabled && (
        <div className="space-y-2 mb-4 p-3 border border-slate-100 rounded-lg">
          <p className="text-xs font-medium text-slate-500 uppercase">Add Manual Message</p>
          <Input placeholder="Motivational message..." value={newMsg} onChange={(e) => setNewMsg(e.target.value)} />
          <Input placeholder="Verse reference (e.g. Philippians 4:13)" value={newVerseRef} onChange={(e) => setNewVerseRef(e.target.value)} />
          <Input placeholder="Verse text (optional)" value={newVerseText} onChange={(e) => setNewVerseText(e.target.value)} />
          <Button onClick={create} className="bg-[#2563EB] w-full">
            <Plus className="w-4 h-4 mr-1" /> Add Message
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-400">Loading...</p>}
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg">
            <div className="pt-1">
              <Switch checked={m.active} onCheckedChange={(v) => toggle(m.id, v)} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-slate-700 italic block">"{m.message}"</span>
              {m.verse_reference && (
                <span className="text-xs text-[#2563EB] font-medium flex items-center gap-1 mt-1">
                  <BookOpen className="w-3 h-3" /> {m.verse_reference}
                  {m.ai_generated && <span className="ml-1 text-[10px] text-slate-400">(AI · {m.display_date})</span>}
                </span>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => remove(m.id)} className="text-red-500 shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {!loading && messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
      </div>
    </div>
  );
}