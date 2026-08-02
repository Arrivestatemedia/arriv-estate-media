import React, { useState, useEffect } from "react";
import { Plus, Trash2, Layers, MapPin, Briefcase, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPipelines, createPipeline, updatePipeline, deletePipeline } from "@/lib/recruitingApi";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function TalentPipelinesView() {
  const [pipelines, setPipelines] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    name: "",
    target_roles: [],
    target_skills: [],
    target_locations: [],
    continuous_recruiting_enabled: false,
    search_frequency_days: 7,
    job_id: null,
    max_prospects_per_cycle: 10,
    radius_miles: 50,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [pipeRes, jobRes] = await Promise.all([
        listPipelines(),
        base44.entities.HireJob.filter({ status: "open" }, "-created_date", 20).catch(() => []),
      ]);
      setPipelines(pipeRes.pipelines || []);
      setJobs(jobRes || []);
    } catch (e) {
      toast.error("Failed to load pipelines");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      target_roles: [],
      target_skills: [],
      target_locations: [],
      continuous_recruiting_enabled: false,
      search_frequency_days: 7,
      job_id: null,
      max_prospects_per_cycle: 10,
      radius_miles: 50,
    });
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || "",
      target_roles: p.target_roles || [],
      target_skills: p.target_skills || [],
      target_locations: p.target_locations || [],
      continuous_recruiting_enabled: p.continuous_recruiting_enabled || false,
      search_frequency_days: p.search_frequency_days || 7,
      job_id: p.job_id || null,
      max_prospects_per_cycle: p.max_prospects_per_cycle || 10,
      radius_miles: p.radius_miles || 50,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Pipeline name is required");
      return;
    }
    try {
      if (editing) {
        await updatePipeline(editing.id, form);
        toast.success("Pipeline updated");
      } else {
        await createPipeline(form);
        toast.success("Pipeline created");
      }
      resetForm();
      load();
    } catch (e) {
      toast.error("Failed to save pipeline");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this pipeline?")) return;
    try {
      await deletePipeline(id);
      toast.success("Pipeline deleted");
      load();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const toggleArrayField = (field, value) => {
    setForm((f) => {
      const arr = f[field];
      if (arr.includes(value)) {
        return { ...f, [field]: arr.filter((v) => v !== value) };
      }
      return { ...f, [field]: [...arr, value] };
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5]">
      <div className="sticky top-0 bg-white border-b border-[#B8956A]/20 px-6 py-4 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Talent Pipelines</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-0.5">Saved groups of prospects with continuous sourcing</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
          <Plus className="w-4 h-4 mr-1.5" /> New Pipeline
        </Button>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {showForm && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5 mb-5 space-y-4">
            <h3 className="font-semibold text-[#1A1A1A]">{editing ? "Edit Pipeline" : "New Pipeline"}</h3>

            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Atlanta Real Estate Agents" />
            </div>

            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Target Job</Label>
              <select
                value={form.job_id || ""}
                onChange={(e) => setForm({ ...form, job_id: e.target.value || null })}
                className="w-full h-10 px-3 rounded-lg border border-[#B8956A]/20 bg-white text-sm"
              >
                <option value="">Any role</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Search Radius (miles)</Label>
                <Input type="number" value={form.radius_miles} onChange={(e) => setForm({ ...form, radius_miles: parseInt(e.target.value) || 50 })} />
              </div>
              <div>
                <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Max Prospects per Cycle</Label>
                <Input type="number" value={form.max_prospects_per_cycle} onChange={(e) => setForm({ ...form, max_prospects_per_cycle: parseInt(e.target.value) || 10 })} />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Target Locations (zip codes, comma-separated)</Label>
              <Input
                value={form.target_locations.join(", ")}
                onChange={(e) => setForm({ ...form, target_locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="30301, 30302"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-[#1A1A1A] mb-1.5">Target Skills (comma-separated)</Label>
              <Input
                value={form.target_skills.join(", ")}
                onChange={(e) => setForm({ ...form, target_skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="real estate, sales, luxury"
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.continuous_recruiting_enabled}
                  onChange={(e) => setForm({ ...form, continuous_recruiting_enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#B8956A]"
                />
                <span className="text-sm text-[#1A1A1A]">Enable continuous recruiting</span>
              </label>
              {form.continuous_recruiting_enabled && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#B8956A]" />
                  <Input
                    type="number"
                    value={form.search_frequency_days}
                    onChange={(e) => setForm({ ...form, search_frequency_days: parseInt(e.target.value) || 7 })}
                    className="w-20"
                  />
                  <span className="text-sm text-[#1A1A1A]/60">days</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} className="bg-[#B8956A] hover:bg-[#A68559] text-white">
                {editing ? "Update" : "Create"} Pipeline
              </Button>
              <Button variant="outline" onClick={resetForm} className="border-[#B8956A]/20">Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Layers className="w-10 h-10 text-[#B8956A]/30 mb-3" />
            <p className="text-[#1A1A1A] font-medium">No pipelines yet</p>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">Create a pipeline to save and organize prospects</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pipelines.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#1A1A1A]">{p.name}</h3>
                      {p.continuous_recruiting_enabled && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-[#B8956A]/15 text-[#B8956A] font-medium">
                          Continuous
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-[#1A1A1A]/60">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {p.prospect_count || 0} prospects
                      </span>
                      {p.target_locations?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {p.target_locations.join(", ")}
                        </span>
                      )}
                      {p.continuous_recruiting_enabled && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Every {p.search_frequency_days} days
                        </span>
                      )}
                    </div>
                    {p.target_skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.target_skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-[#FFFBF5] text-[#1A1A1A]/60 border border-[#B8956A]/15">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0 ml-3">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(p)} className="border-[#B8956A]/20">Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="text-red-500 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}