import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, Shield, Check, X } from "lucide-react";
import { EDITOR_CAPABILITIES, EDITOR_CAPABILITY_LABELS } from "@/lib/editingConfig";

export default function EditorManager({ editors, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [unassigned, setUnassigned] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedCaps, setSelectedCaps] = useState([]);
  const [editingProfile, setEditingProfile] = useState(null);

  const loadUnassigned = async () => {
    try {
      const res = await base44.functions.invoke("manageEditorProfile", { action: "list_employees" });
      const resData = res?.data || res;
      setUnassigned(resData?.unassigned_employees || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUnassigned();
  }, [editors.length]);

  const handleCreate = async () => {
    if (!selectedEmployee) return;
    setLoading(true);
    try {
      await base44.functions.invoke("manageEditorProfile", {
        action: "create",
        employee_id: selectedEmployee,
        verified_capabilities: selectedCaps,
        max_weekly_hours: 32,
      });
      setSelectedEmployee("");
      setSelectedCaps([]);
      setShowCreate(false);
      onRefresh();
    } catch (err) {
      alert(err.message || err.error || "Failed to create editor profile");
    } finally {
      setLoading(false);
    }
  };

  const toggleCapability = (cap) => {
    setSelectedCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const updateProfile = async (profileId, updates) => {
    setLoading(true);
    try {
      await base44.functions.invoke("manageEditorProfile", {
        action: "update",
        profile_id: profileId,
        ...updates,
      });
      onRefresh();
    } catch (err) {
      alert(err.message || err.error || "Failed to update");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A1A]">Editor Profiles</h2>
          <p className="text-sm text-[#1A1A1A]/60">
            Arriv employees with verified editing capabilities. Only verified capabilities determine assignment eligibility.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} size="sm">
          <UserPlus className="w-4 h-4 mr-2" /> Add Editor
        </Button>
      </div>

      {/* Create new editor */}
      {showCreate && (
        <Card className="p-4 space-y-3 border-[#B8956A]/30">
          <div>
            <Label>Select Employee</Label>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose an employee..." />
              </SelectTrigger>
              <SelectContent>
                {unassigned.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.full_name} ({e.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unassigned.length === 0 && (
              <p className="text-xs text-[#1A1A1A]/50 mt-1">All employees already have editor profiles.</p>
            )}
          </div>
          <div>
            <Label>Verified Capabilities</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {EDITOR_CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  onClick={() => toggleCapability(cap)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    selectedCaps.includes(cap)
                      ? "bg-[#B8956A] text-[#1A1A1A] border-[#B8956A]"
                      : "bg-white text-[#1A1A1A]/70 border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                  }`}
                >
                  {EDITOR_CAPABILITY_LABELS[cap]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={loading || !selectedEmployee}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Profile"}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Existing editors */}
      <div className="space-y-2">
        {editors.length === 0 && !showCreate ? (
          <Card className="p-8 text-center text-[#1A1A1A]/50">
            No editor profiles yet. Click "Add Editor" to create one.
          </Card>
        ) : (
          editors.map((editor) => (
            <Card key={editor.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-[#1A1A1A]">{editor.employee_name}</p>
                    <Badge className={editor.editor_status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                      {editor.editor_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#1A1A1A]/50">{editor.employee_email}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(editor.verified_editor_capabilities || []).map((cap) => (
                      <Badge key={cap} className="bg-[#B8956A]/15 text-[#B8956A] text-xs">
                        <Shield className="w-3 h-3 mr-1" />
                        {EDITOR_CAPABILITY_LABELS[cap] || cap}
                      </Badge>
                    ))}
                    {(editor.declared_editor_capabilities || [])
                      .filter((c) => !(editor.verified_editor_capabilities || []).includes(c))
                      .map((cap) => (
                        <Badge key={cap} className="bg-gray-100 text-gray-500 text-xs">
                          {EDITOR_CAPABILITY_LABELS[cap] || cap} (pending)
                        </Badge>
                      ))}
                  </div>
                  {editor.hourly_wage && (
                    <p className="text-xs text-[#1A1A1A]/50 mt-2">Hourly wage: ${editor.hourly_wage}/hr</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingProfile(editingProfile === editor.id ? null : editor.id)}
                  >
                    {editingProfile === editor.id ? "Done" : "Edit"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateProfile(editor.id, { editor_status: editor.editor_status === "active" ? "inactive" : "active" })}
                  >
                    {editor.editor_status === "active" ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>

              {/* Inline capability editor */}
              {editingProfile === editor.id && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <Label className="text-xs">Toggle Verified Capabilities</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {EDITOR_CAPABILITIES.map((cap) => {
                      const isVerified = (editor.verified_editor_capabilities || []).includes(cap);
                      return (
                        <button
                          key={cap}
                          onClick={() => {
                            const newCaps = isVerified
                              ? (editor.verified_editor_capabilities || []).filter((c) => c !== cap)
                              : [...(editor.verified_editor_capabilities || []), cap];
                            updateProfile(editor.id, { verified_capabilities: newCaps });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            isVerified
                              ? "bg-[#B8956A] text-[#1A1A1A] border-[#B8956A]"
                              : "bg-white text-[#1A1A1A]/60 border-[#B8956A]/20 hover:bg-[#B8956A]/10"
                          }`}
                        >
                          {isVerified && <Check className="w-3 h-3 inline mr-1" />}
                          {EDITOR_CAPABILITY_LABELS[cap]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}