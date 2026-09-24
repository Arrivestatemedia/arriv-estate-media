import React from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Trash2, Pencil } from "lucide-react";
import { deleteFlyer } from "@/lib/studioFlyerApi";

export default function FlyerCard({ flyer, userEmail, onDeleted }) {
  const navigate = useNavigate();
  const thumb = flyer.thumbnail_url || flyer.content?.hero_image;

  const del = async () => {
    if (!confirm("Delete this flyer?")) return;
    try { await deleteFlyer(userEmail, flyer.id); onDeleted(flyer.id); }
    catch (e) { alert("Delete failed"); }
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden flex flex-col">
      <div className="aspect-[850/1100] bg-muted relative cursor-pointer" onClick={() => navigate(`/FlyerBuilderPage?flyer_id=${flyer.id}`)}>
        {thumb
          ? <img src={thumb} alt={flyer.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No preview</div>}
        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-black/60 text-white">{flyer.status}</div>
      </div>
      <div className="p-3 flex items-center justify-between">
        <span className="text-sm font-medium truncate">{flyer.name}</span>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => navigate(`/FlyerBuilderPage?flyer_id=${flyer.id}`)}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={del}><Trash2 className="w-4 h-4 text-red-500" /></Button>
        </div>
      </div>
    </div>
  );
}