import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const callCenter = (payload) =>
  base44.functions.invoke("callCenterAdmin", payload).then((r) => r?.data ?? r);

export default function IvrSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [reps, setReps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    callCenter({ action: "getSettings" })
      .then((d) => {
        setSettings(d?.settings || {});
        setReps(d?.reps || []);
      })
      .catch(() => setSettings({}));
  }, []);

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const toggleRep = (id) => {
    const current = Array.isArray(settings?.sales_rep_member_ids) ? settings.sales_rep_member_ids : [];
    set({
      sales_rep_member_ids: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await callCenter({ action: "saveSettings", settings }).catch(() => null);
    setSaving(false);
    setSaved(true);
  };

  if (!settings) return <p className="py-10 text-center text-sm text-[#1A1A1A]/50">Loading settings…</p>;

  return (
    <div className="space-y-4 pb-10">
      <Card className="border-[#B8956A]/25 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg text-[#1A1A1A]">Sales ring group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-[#1A1A1A]/50">
            Eligible Growth Advisors ring together. Their primary business number rings first, then their cellphone,
            then the owner fallback.
          </p>
          <div className="space-y-2">
            {reps.length === 0 ? (
              <p className="text-sm text-[#1A1A1A]/50">No active team members found.</p>
            ) : (
              reps.map((rep) => (
                <label key={rep.id} className="flex items-center gap-3 text-sm text-[#1A1A1A]">
                  <Checkbox
                    checked={(settings.sales_rep_member_ids || []).includes(rep.id)}
                    onCheckedChange={() => toggleRep(rep.id)}
                  />
                  <span>{rep.name}</span>
                  <span className="text-xs text-[#1A1A1A]/40">
                    {rep.primary || "no business number"} · {rep.cell || "no cell"}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Stage 1 timeout (s)</Label>
              <Input
                type="number"
                value={settings.stage1_timeout ?? 18}
                onChange={(e) => set({ stage1_timeout: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Stage 2 timeout (s)</Label>
              <Input
                type="number"
                value={settings.stage2_timeout ?? 18}
                onChange={(e) => set({ stage2_timeout: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Stage 3 timeout (s)</Label>
              <Input
                type="number"
                value={settings.stage3_timeout ?? 20}
                onChange={(e) => set({ stage3_timeout: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Owner fallback number</Label>
              <Input
                value={settings.owner_fallback_number || ""}
                onChange={(e) => set({ owner_fallback_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Support number</Label>
              <Input
                value={settings.support_number || ""}
                onChange={(e) => set({ support_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Caller ID on transfers</Label>
              <Input
                value={settings.public_caller_id || ""}
                onChange={(e) => set({ public_caller_id: e.target.value })}
              />
            </div>
            <div>
              <Label>Alert number for SMS</Label>
              <Input
                placeholder="Defaults to the owner fallback"
                value={settings.notify_number || ""}
                onChange={(e) => set({ notify_number: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
            <div>
              <p className="text-sm text-[#1A1A1A]">Require press-1 acceptance</p>
              <p className="text-xs text-[#1A1A1A]/50">
                Stops a phone's voicemail greeting from claiming a sales call.
              </p>
            </div>
            <Switch
              checked={!!settings.agent_acceptance_required}
              onCheckedChange={(v) => set({ agent_acceptance_required: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#B8956A]/25 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg text-[#1A1A1A]">Callbacks, voicemail and Ashley</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Callback assignment</Label>
            <Select
              value={settings.callback_assignment || "owner"}
              onValueChange={(v) => set({ callback_assignment: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="client_owner">The client's Media Partner</SelectItem>
                <SelectItem value="round_robin">Round robin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3">
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">Ashley, AI booking concierge</span>
              <Switch checked={!!settings.ashley_enabled} onCheckedChange={(v) => set({ ashley_enabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">Ashley may submit real bookings</span>
              <Switch
                checked={!!settings.ashley_booking_enabled}
                onCheckedChange={(v) => set({ ashley_booking_enabled: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">Voicemail enabled</span>
              <Switch
                checked={!!settings.voicemail_enabled}
                onCheckedChange={(v) => set({ voicemail_enabled: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">SMS alert on new voicemail</span>
              <Switch
                checked={!!settings.notify_owner_on_voicemail}
                onCheckedChange={(v) => set({ notify_owner_on_voicemail: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">SMS alert on callback request</span>
              <Switch
                checked={!!settings.notify_owner_on_callback}
                onCheckedChange={(v) => set({ notify_owner_on_callback: v })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-[#B8956A]/20 p-3">
              <span className="text-sm text-[#1A1A1A]">SMS alert when Arriv Assist ticket created</span>
              <Switch
                checked={!!settings.notify_owner_on_ticket}
                onCheckedChange={(v) => set({ notify_owner_on_ticket: v })}
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#B8956A]/25 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="font-serif text-lg text-[#1A1A1A]">Spoken wording</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Public menu</Label>
            <Textarea
              value={settings.greeting_public || ""}
              onChange={(e) => set({ greeting_public: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
          <div>
            <Label>Media Specialist greeting ({"{first_name}"} is replaced)</Label>
            <Textarea
              value={settings.greeting_specialist || ""}
              onChange={(e) => set({ greeting_specialist: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
          <div>
            <Label>Client greeting</Label>
            <Textarea
              value={settings.greeting_client || ""}
              onChange={(e) => set({ greeting_client: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
          <div>
            <Label>
              Prospect greeting ({"{first_name}"} and {"{rep_name}"} are replaced)
            </Label>
            <Textarea
              value={settings.greeting_prospect || ""}
              onChange={(e) => set({ greeting_prospect: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
          <div>
            <Label>Support overflow menu</Label>
            <Textarea
              value={settings.support_overflow_text || ""}
              onChange={(e) => set({ support_overflow_text: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
          <div>
            <Label>Technical support voicemail prompt</Label>
            <Textarea
              value={settings.tech_support_prompt || ""}
              onChange={(e) => set({ tech_support_prompt: e.target.value })}
              className="min-h-[70px]"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving} className="w-full bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]">
        {saving ? "Saving…" : saved ? "Saved" : "Save call center settings"}
      </Button>
    </div>
  );
}