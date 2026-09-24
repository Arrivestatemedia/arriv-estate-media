import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImagePlus, X } from "lucide-react";

const ICON_OPTIONS = [
  { value: "bed", label: "Bed" }, { value: "bath", label: "Bath" }, { value: "ruler", label: "Ruler" },
  { value: "building", label: "Building" }, { value: "tree", label: "Tree" }, { value: "diamond", label: "Diamond" },
  { value: "home", label: "Home" }, { value: "pin", label: "Pin" },
];

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function IconSelect({ value, onChange }) {
  return (
    <Select value={value || "diamond"} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{ICON_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ImageField({ label, value, onPick, onClear }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        {value ? (
          <div className="relative w-16 h-16 rounded overflow-hidden border">
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={onClear} className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onPick}><ImagePlus className="w-4 h-4 mr-1" />Choose</Button>
        )}
      </div>
    </div>
  );
}

// Right-panel form. Controlled by content/setContent; onPickImage(field) opens
// the media picker for a given content field.
export default function FlyerForm({ content, setContent, onPickImage }) {
  const set = (k, v) => setContent({ ...content, [k]: v });
  const features = content.features || [];
  const stats = content.stats || [];
  const gallery = content.gallery_images || ["", ""];

  const setFeature = (i, k, v) => {
    const f = features.slice();
    while (f.length <= i) f.push({ icon: "diamond", title: "", description: "" });
    f[i] = { ...f[i], [k]: v };
    set("features", f);
  };
  const setStat = (i, k, v) => {
    const s = stats.slice();
    while (s.length <= i) s.push({ icon: "bed", value: "", label: "" });
    s[i] = { ...s[i], [k]: v };
    set("stats", s);
  };
  const setGallery = (i, v) => {
    const g = gallery.slice();
    while (g.length <= i) g.push("");
    g[i] = v;
    set("gallery_images", g);
  };

  return (
    <div className="space-y-5">
      <Section title="Property Details">
        <div><Label className="text-xs">Eyebrow</Label><Input value={content.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Headline</Label><Input value={content.headline || ""} onChange={(e) => set("headline", e.target.value)} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Subheadline</Label><Input value={content.subheadline || ""} onChange={(e) => set("subheadline", e.target.value)} className="h-8 text-sm" /></div>
        <div><Label className="text-xs">Body Text</Label><Textarea value={content.body_text || ""} onChange={(e) => set("body_text", e.target.value)} rows={4} className="text-sm" /></div>
        <div><Label className="text-xs">Tagline</Label><Input value={content.tagline || ""} onChange={(e) => set("tagline", e.target.value)} className="h-8 text-sm" /></div>
      </Section>

      <Section title="Hero Image">
        <ImageField label="Hero Image" value={content.hero_image} onPick={() => onPickImage("hero_image")} onClear={() => set("hero_image", "")} />
        <div><Label className="text-xs">Hero Callout (use line breaks)</Label><Textarea value={content.hero_callout || ""} onChange={(e) => set("hero_callout", e.target.value)} rows={3} className="text-sm" /></div>
      </Section>

      <Section title="Stats">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_1fr] gap-2 items-center">
            <IconSelect value={stats[i]?.icon} onChange={(v) => setStat(i, "icon", v)} />
            <Input placeholder="Value" value={stats[i]?.value || ""} onChange={(e) => setStat(i, "value", e.target.value)} className="h-8 text-sm" />
            <Input placeholder="Label" value={stats[i]?.label || ""} onChange={(e) => setStat(i, "label", e.target.value)} className="h-8 text-sm" />
          </div>
        ))}
      </Section>

      <Section title="Features">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 border rounded p-2">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <IconSelect value={features[i]?.icon} onChange={(v) => setFeature(i, "icon", v)} />
              <Input placeholder="Title" value={features[i]?.title || ""} onChange={(e) => setFeature(i, "title", e.target.value)} className="h-8 text-sm" />
            </div>
            <Textarea placeholder="Description" value={features[i]?.description || ""} onChange={(e) => setFeature(i, "description", e.target.value)} rows={2} className="text-sm" />
          </div>
        ))}
      </Section>

      <Section title="Gallery">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <ImageField key={i} label={`Gallery ${i + 1}`} value={gallery[i]} onPick={() => onPickImage(`gallery_${i}`)} onClear={() => setGallery(i, "")} />
          ))}
        </div>
      </Section>

      <Section title="Agent & Company">
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Agent Name</Label><Input value={content.agent_name || ""} onChange={(e) => set("agent_name", e.target.value)} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Agent Title</Label><Input value={content.agent_title || ""} onChange={(e) => set("agent_title", e.target.value)} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Agent Phone</Label><Input value={content.agent_phone || ""} onChange={(e) => set("agent_phone", e.target.value)} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">Office Phone</Label><Input value={content.agent_office_phone || ""} onChange={(e) => set("agent_office_phone", e.target.value)} className="h-8 text-sm" /></div>
        </div>
        <ImageField label="Agent Headshot" value={content.agent_headshot} onPick={() => onPickImage("agent_headshot")} onClear={() => set("agent_headshot", "")} />
        <ImageField label="Company Logo" value={content.company_logo} onPick={() => onPickImage("company_logo")} onClear={() => set("company_logo", "")} />
        <div><Label className="text-xs">Company Name</Label><Input value={content.company_name || ""} onChange={(e) => set("company_name", e.target.value)} className="h-8 text-sm" /></div>
      </Section>
    </div>
  );
}