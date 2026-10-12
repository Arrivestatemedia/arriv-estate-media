import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageIcon, Video, ArrowUp, ArrowDown, Star, Loader2 } from "lucide-react";

// Select photographs from the existing delivery gallery, choose a cover, set the order and
// optionally include delivered video. No uploads: the media already exists on the job.
export default function PropertyMediaSelector({ files, listing, busy, onSave }) {
  const photos = files.filter((f) => f.isImage);
  const videos = files.filter((f) => f.isVideo);
  const [selected, setSelected] = useState([]);
  const [coverId, setCoverId] = useState("");
  const [includeVideo, setIncludeVideo] = useState(false);

  useEffect(() => {
    const initial = (listing?.selected_media || []).map((m) => ({
      drive_file_id: m.drive_file_id,
      kind: m.kind,
      name: m.name,
      alt_text: m.alt_text || "",
    }));
    setSelected(initial);
    setCoverId(listing?.cover_file_id || "");
    setIncludeVideo(listing?.include_video === true);
  }, [listing?.listing_id, listing?.updated_at]);

  const toggle = (file) => {
    setSelected((prev) => {
      const exists = prev.find((s) => s.drive_file_id === file.id);
      if (exists) return prev.filter((s) => s.drive_file_id !== file.id);
      return [...prev, { drive_file_id: file.id, kind: file.isImage ? "photo" : "video", name: file.name, alt_text: "" }];
    });
  };

  const move = (index, dir) => {
    setSelected((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    const payload = selected
      .filter((s) => s.kind === "photo" || includeVideo)
      .map((s, index) => ({ drive_file_id: s.drive_file_id, position: index }));
    onSave({ selected_media: payload, cover_file_id: coverId, include_video: includeVideo });
  };

  const isChosen = (id) => selected.some((s) => s.drive_file_id === id);

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="text-lg font-medium text-[#1A1A1A] mb-1">Choose your photographs</h2>
      <p className="text-sm text-[#1A1A1A]/50 mb-5">
        Nothing is published automatically — only what you select here. Delivered media stays private until you approve publication.
      </p>

      {photos.length === 0 ? (
        <p className="text-sm text-[#1A1A1A]/50">No delivered photographs found for this order.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
          {photos.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f)}
              className={`relative rounded-lg overflow-hidden aspect-square border transition-all ${
                isChosen(f.id) ? "border-[#B8956A] ring-2 ring-[#B8956A]/40" : "border-black/10 hover:border-[#B8956A]/50"
              }`}
            >
              {f.thumbnailLink ? (
                <img src={f.thumbnailLink} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-[#FFFBF5]"><ImageIcon className="w-5 h-5 text-[#B8956A]/50" /></span>
              )}
              {isChosen(f.id) && <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#B8956A] text-[10px] text-[#1A1A1A] font-bold flex items-center justify-center">{selected.findIndex((s) => s.drive_file_id === f.id) + 1}</span>}
            </button>
          ))}
        </div>
      )}

      {videos.length > 0 && (
        <label className="flex items-center gap-3 mb-6 text-sm text-[#1A1A1A]/70">
          <input type="checkbox" checked={includeVideo} onChange={(e) => setIncludeVideo(e.target.checked)} className="w-4 h-4 accent-[#B8956A]" />
          <Video className="w-4 h-4 text-[#B8956A]" />
          Include delivered video on the page
        </label>
      )}

      {selected.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-medium text-[#1A1A1A] mb-3">Order and cover</h3>
          <div className="space-y-2">
            {selected.map((s, i) => (
              <div key={s.drive_file_id} className="flex items-center gap-3 rounded-lg border border-black/5 bg-[#FFFBF5] px-3 py-2">
                <span className="text-xs text-[#1A1A1A]/40 w-5">{i + 1}</span>
                <span className="flex-1 text-sm text-[#1A1A1A] truncate">{s.name}</span>
                <button type="button" onClick={() => setCoverId(s.drive_file_id)} className={`text-xs px-2 py-1 rounded ${coverId === s.drive_file_id ? "bg-[#B8956A] text-[#1A1A1A] font-semibold" : "text-[#1A1A1A]/50 hover:bg-black/5"}`}>
                  <Star className="w-3 h-3 inline mr-1" />Cover
                </button>
                <button type="button" onClick={() => move(i, -1)} className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => toggle({ id: s.drive_file_id, name: s.name, isImage: s.kind === "photo", isVideo: s.kind === "video" })} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button onClick={save} disabled={busy === "save_media" || selected.length === 0} className="bg-[#B8956A] hover:bg-[#A68559] text-[#1A1A1A]">
        {busy === "save_media" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save selection
      </Button>
    </section>
  );
}