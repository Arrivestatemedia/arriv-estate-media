import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

export default function MediaPartnerAddressGate({ open, email, onSaved }) {
  const [data, setData] = useState({ mailing_address: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const incomplete =
    !data.mailing_address.trim() ||
    !data.city.trim() ||
    !data.state.trim() ||
    !data.zip.trim();

  const save = async () => {
    if (incomplete || !email) return;
    setSaving(true);
    setError("");
    try {
      const res = await base44.functions.invoke("saveMediaPartnerAddress", { email, ...data });
      if (res?.data?.success) {
        onSaved?.();
      } else {
        setError(res?.data?.error || "Could not save address.");
      }
    } catch (e) {
      setError(e?.message || "Could not save address.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="border-2 border-[#B8956A]/30 max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[#1A1A1A] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#B8956A]" />
            Confirm Your Address
          </DialogTitle>
          <DialogDescription className="text-[#1A1A1A]/60">
            We need your home address so we can show you gigs in your state.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[#1A1A1A] text-xs">Street Address *</Label>
            <Input
              value={data.mailing_address}
              onChange={(e) => set("mailing_address", e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#1A1A1A] text-xs">City *</Label>
              <Input
                value={data.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Phoenix"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#1A1A1A] text-xs">State *</Label>
              <select
                value={data.state}
                onChange={(e) => set("state", e.target.value)}
                className="flex h-11 md:h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm md:text-sm"
              >
                <option value="">Select</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#1A1A1A] text-xs">ZIP *</Label>
            <Input
              value={data.zip}
              onChange={(e) => set("zip", e.target.value)}
              placeholder="85001"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            onClick={save}
            disabled={saving || incomplete}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              "Save & View Gigs"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}