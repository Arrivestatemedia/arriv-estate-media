import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function EditMyProfileModal({ salesMemberId, open, onClose, onSaved }) {
  const [form, setForm] = useState({ title: "", work_phone: "", phone_number: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !salesMemberId) return;
    base44.entities.SalesTeamMember.filter({ id: salesMemberId }).then(members => {
      const m = members?.[0];
      if (m) {
        setForm({
          title: m.title || "",
          work_phone: m.work_phone || "",
          phone_number: m.phone_number || ""
        });
      }
    }).catch(() => {});
  }, [salesMemberId, open]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.SalesTeamMember.update(salesMemberId, form);
    setSaving(false);
    toast.success("Profile updated!");
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit My Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Job Title</label>
            <Input placeholder="e.g. Sales Representative" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Work Phone</label>
            <Input placeholder="e.g. (555) 000-1111" value={form.work_phone} onChange={e => setForm(f => ({ ...f, work_phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cell Phone</label>
            <Input placeholder="e.g. (555) 000-2222" value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} />
          </div>
          <Button className="w-full" style={{ backgroundColor: '#B8956A', color: '#1A1A1A' }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}