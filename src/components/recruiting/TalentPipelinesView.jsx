import React, { useState, useEffect } from "react";
import { listPipelines, createPipeline, updatePipeline, deletePipeline } from "@/lib/recruitingApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, X, Pencil, Layers } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const EMPTY = { name: "", target_roles: [], target_skills: [], target_locations: [], target_radius_miles: 25, continuous_recruiting_enabled: false, search_frequency_days: 7, max_prospects_per_cycle: 15 };

export default function TalentPipelinesView() {
  const [pipelines, setPipelines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPipelines();
      setPipelines(data.pipelines || []);
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name) return;
    try {
      if (editing) {
        await updatePipeline(editing, form);
      } else {
        await createPipeline(form);
      }
      setShowForm(false); setEditing(null); setForm(EMPTY); load();
    } catch (e) { alert("Failed to save pipeline: " + e.message); }
  };

  const handleEdit = (p) => {
    setEditing(p.id);
    setForm({
      name: p.name, target_roles: p.target_roles || [], target_skills: p.target_skills || [],
      target_locations: p.target_locations || [], target_radius_miles: p.target_radius_miles || 25,
      continuous_recruiting_enabled: p.continuous_recruiting_enabled || false,
      search_frequency_days: p.search_frequency_days || 7, max_prospects_per_cycle: p.max_prospects_per_cycle || 15,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this pipeline?")) return;
    await deletePipeline(id); load();
  };

  const arrayField = (key, label) => (
    <div>
      <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>{label}</Label>
      <input value={form[key].join(", ")} onChange={(e) => setForm({ ...form, [key]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        className="w-full p-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-[#B8956A]"
        style={{ borderColor: "rgba(184,149,106,0.2)", color: TEXT_DARK }} placeholder="Comma-separated" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Talent Pipelines</h2>
        <Button onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true); }} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
          <Plus className="w-4 h-4 mr-2" /> New Pipeline
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>
      ) : pipelines.length === 0 ? (
        <div className="text-center py-20">
          <Layers className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium" style={{ color: TEXT_DARK }}>No pipelines yet</p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>Create a pipeline to save groups of target prospects.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pipelines.map((p) => (
            <div key={p.id} className="p-5 rounded-xl" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.15)" }}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{p.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(p)} className="p-1.5 rounded hover:bg-[rgba(184,149,106,0.1)]"><Pencil className="w-3.5 h-3.5" style={{ color: GOLD }} /></button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5" style={{ color: "#FCA5A5" }} /></button>
                </div>
              </div>
              {p.target_roles?.length > 0 && <p className="text-xs mb-1" style={{ color: MUTED }}>Roles: {p.target_roles.join(", ")}</p>}
              {p.target_locations?.length > 0 && <p className="text-xs mb-1" style={{ color: MUTED }}>Locations: {p.target_locations.join(", ")}</p>}
              <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: MUTED }}>
                <span>{p.prospect_count || 0} prospects</span>
                {p.continuous_recruiting_enabled && <span style={{ color: GOLD }}>● Continuous</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 rounded-xl" style={{ backgroundColor: CREAM, border: "1px solid rgba(184,149,106,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{editing ? "Edit Pipeline" : "New Pipeline"}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5" style={{ color: MUTED }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-white" />
              </div>
              {arrayField("target_roles", "Target Roles")}
              {arrayField("target_skills", "Target Skills")}
              {arrayField("target_locations", "Target Locations (zip codes)")}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Radius (mi)</Label>
                  <Input type="number" value={form.target_radius_miles} onChange={(e) => setForm({ ...form, target_radius_miles: parseInt(e.target.value) || 25 })} className="bg-white" />
                </div>
                <div>
                  <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Freq (days)</Label>
                  <Input type="number" value={form.search_frequency_days} onChange={(e) => setForm({ ...form, search_frequency_days: parseInt(e.target.value) || 7 })} className="bg-white" />
                </div>
                <div>
                  <Label className="block text-sm font-medium mb-1" style={{ color: TEXT_DARK }}>Max/Cycle</Label>
                  <Input type="number" value={form.max_prospects_per_cycle} onChange={(e) => setForm({ ...form, max_prospects_per_cycle: parseInt(e.target.value) || 15 })} className="bg-white" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm" style={{ color: TEXT_DARK }}>
                <input type="checkbox" checked={form.continuous_recruiting_enabled} onChange={(e) => setForm({ ...form, continuous_recruiting_enabled: e.target.checked })} />
                Enable continuous recruiting (auto-sources new prospects on a schedule)
              </label>
            </div>
            <div className="flex gap-3 mt-5 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancel</Button>
              <Button onClick={handleSave} className="flex-1" style={{ backgroundColor: GOLD, color: "#1A1A1A" }}>{editing ? "Update" : "Create"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}