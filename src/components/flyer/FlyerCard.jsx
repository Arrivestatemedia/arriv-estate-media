import React from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil } from "lucide-react";
import { deleteFlyer } from "@/lib/studioFlyerApi";

// Dark-themed flyer card for the Studio shell. onEdit(id) opens the builder.
export default function FlyerCard({ flyer, userEmail, onDeleted, onEdit }) {
  const thumb = flyer.thumbnail_url || flyer.content?.hero_image;

  const del = async () => {
    if (!confirm("Delete this flyer?")) return;
    try { await deleteFlyer(userEmail, flyer.id); onDeleted(flyer.id); }
    catch (e) { alert("Delete failed"); }
  };

  return (
    <div className="rounded-lg overflow-hidden flex flex-col" style={{ background: "#1a1a1a", border: "1px solid #2d2d2d" }}>
      <div className="aspect-[850/1100] relative cursor-pointer" style={{ background: "#2a2a2a" }} onClick={() => onEdit(flyer.id)}>
        {thumb
          ? <img src={thumb} alt={flyer.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: "#666" }}>No preview</div>}
        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>{flyer.status}</div>
      </div>
      <div className="p-3 flex items-center justify-between">
        <span className="text-sm font-medium truncate" style={{ color: "#fff" }}>{flyer.name}</span>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => onEdit(flyer.id)}><Pencil className="w-4 h-4" style={{ color: "#a0a0a0" }} /></Button>
          <Button size="icon" variant="ghost" onClick={del}><Trash2 className="w-4 h-4 text-red-500" /></Button>
        </div>
      </div>
    </div>
  );
}