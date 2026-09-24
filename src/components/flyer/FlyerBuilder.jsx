import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Trash2, Download, ArrowLeft } from "lucide-react";
import FlyerPreview from "./FlyerPreview";
import FlyerForm from "./FlyerForm";
import MediaPicker from "./MediaPicker";
import FlyerTemplate from "./FlyerTemplate";
import { getFlyer, saveFlyer, deleteFlyer } from "@/lib/studioFlyerApi";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const EMPTY = {
  eyebrow: "", headline: "", subheadline: "", body_text: "", tagline: "",
  hero_image: "", hero_callout: "", gallery_images: ["", ""],
  features: [
    { icon: "diamond", title: "", description: "" },
    { icon: "home", title: "", description: "" },
    { icon: "pin", title: "", description: "" },
  ],
  stats: [
    { icon: "bed", value: "", label: "" }, { icon: "bath", value: "", label: "" },
    { icon: "ruler", value: "", label: "" }, { icon: "building", value: "", label: "" },
    { icon: "tree", value: "", label: "" },
  ],
  agent_name: "", agent_title: "", agent_phone: "", agent_office_phone: "",
  agent_headshot: "", company_name: "", company_logo: "",
};

// Two-panel flyer builder: live scaled preview on the left, form on the right.
export default function FlyerBuilder({ userEmail }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const flyerId = params.get("flyer_id");

  const [name, setName] = useState("");
  const [content, setContent] = useState(EMPTY);
  const [status, setStatus] = useState("DRAFT");
  const [loading, setLoading] = useState(!!flyerId);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerField, setPickerField] = useState(null);
  const exportRef = useRef(null);

  useEffect(() => {
    if (!flyerId) return;
    (async () => {
      try {
        const res = await getFlyer(userEmail, flyerId);
        const f = res.flyer;
        setName(f.name || "");
        setContent({ ...EMPTY, ...(f.content || {}) });
        setStatus(f.status || "DRAFT");
      } catch (e) { alert("Load failed: " + e.message); }
      finally { setLoading(false); }
    })();
  }, [flyerId]);

  const pickImage = (field) => { setPickerField(field); setPickerOpen(true); };

  const onPick = (url) => {
    if (pickerField === "hero_image") setContent((c) => ({ ...c, hero_image: url }));
    else if (pickerField === "agent_headshot") setContent((c) => ({ ...c, agent_headshot: url }));
    else if (pickerField === "company_logo") setContent((c) => ({ ...c, company_logo: url }));
    else if (pickerField?.startsWith("gallery_")) {
      const i = parseInt(pickerField.split("_")[1], 10);
      setContent((c) => { const g = [...(c.gallery_images || ["", ""])]; g[i] = url; return { ...c, gallery_images: g }; });
    }
  };

  const handleSave = async (publish = false) => {
    if (!name.trim()) { alert("Please enter a flyer name"); return; }
    setSaving(true);
    try {
      const data = { name, template: "LUXURY_ESTATE", content, status: publish ? "PUBLISHED" : status };
      if (flyerId) data.flyer_id = flyerId;
      const res = await saveFlyer(userEmail, data);
      if (!flyerId && res.flyer?.id) navigate(`/FlyerBuilderPage?flyer_id=${res.flyer.id}`, { replace: true });
      if (publish) setStatus("PUBLISHED");
      alert("Saved");
    } catch (e) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!flyerId) return;
    if (!confirm("Delete this flyer?")) return;
    try { await deleteFlyer(userEmail, flyerId); navigate("/Flyers"); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  const exportPDF = async () => {
    const node = exportRef.current;
    if (!node) return;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#f5f2ed" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "px", [850, 1100]);
      pdf.addImage(img, "PNG", 0, 0, 850, 1100);
      pdf.save(`${(name || "flyer").replace(/[^a-z0-9]+/gi, "_")}.pdf`);
    } catch (e) { alert("Export failed: " + e.message); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin w-8 h-8 text-[#B8956A]" /></div>;

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/Flyers")}><ArrowLeft className="w-4 h-4" /></Button>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flyer name..." className="max-w-xs" />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportPDF}><Download className="w-4 h-4 mr-1" />PDF</Button>
        {flyerId && <Button variant="outline" size="sm" onClick={handleDelete}><Trash2 className="w-4 h-4" /></Button>}
        <Button size="sm" disabled={saving} onClick={() => handleSave(false)}><Save className="w-4 h-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
        <Button size="sm" disabled={saving} onClick={() => handleSave(true)} className="bg-[#B8956A] text-white hover:bg-[#A68559]">Publish</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <div className="bg-white rounded-lg border p-4">
          <FlyerPreview content={content} />
        </div>
        <div className="bg-white rounded-lg border p-4 max-h-[75vh] overflow-y-auto">
          <FlyerForm content={content} setContent={setContent} onPickImage={pickImage} />
        </div>
      </div>

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} userEmail={userEmail} />

      {/* Offscreen full-size template for PDF export */}
      <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden="true">
        <FlyerTemplate ref={exportRef} content={content} />
      </div>
    </div>
  );
}