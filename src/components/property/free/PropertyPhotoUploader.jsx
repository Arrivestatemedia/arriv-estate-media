import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Star, Trash2 } from "lucide-react";

// Photographs for a property page that has no Arriv shoot behind it. The customer supplies their own
// pictures; each one is stored publicly because the published page renders without a session, and the
// page only ever shows the selection saved here.

const MAX_PHOTOS = 30;

export default function PropertyPhotoUploader({ listing, busy, onSave }) {
  const [photos, setPhotos] = useState([]);
  const [coverId, setCoverId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    const initial = (listing?.selected_media || []).map((m) => ({
      drive_file_id: m.drive_file_id,
      url: m.url || "",
      name: m.name || "",
    }));
    setPhotos(initial);
    setCoverId(listing?.cover_file_id || initial[0]?.drive_file_id || "");
  }, [listing?.listing_id, listing?.updated_at]);

  const pick = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setError("");
    setUploading(true);
    try {
      const room = Math.max(0, MAX_PHOTOS - photos.length);
      const added = [];
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith("image/")) continue;
        const res = await base44.integrations.Core.UploadPublicFile({ file });
        const url = res?.file_url || res?.data?.file_url;
        if (!url) continue;
        added.push({
          drive_file_id: `up_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
          url,
          name: file.name,
        });
      }
      setPhotos((prev) => {
        const next = [...prev, ...added];
        if (!coverId && next[0]) setCoverId(next[0].drive_file_id);
        return next;
      });
      if (files.length > room) setError(`A page holds up to ${MAX_PHOTOS} photographs.`);
    } catch (err) {
      setError(err?.message || "That photograph could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const move = (index, dir) => {
    setPhotos((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    onSave({
      selected_media: photos.map((p) => ({
        drive_file_id: p.drive_file_id,
        url: p.url,
        name: p.name,
        kind: "photo",
      })),
      cover_file_id: coverId || photos[0]?.drive_file_id || "",
    });
  };

  return (
    <section className="rounded-2xl border border-[#B8956A]/25 bg-white p-6">
      <h2 className="mb-1 text-lg font-medium text-[#1A1A1A]">Photographs</h2>
      <p className="mb-5 text-sm text-[#1A1A1A]/50">
        Add your own photographs, then set the order and the one that leads the page. Nothing appears on
        the page until you save and approve it.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        onChange={pick}
        className="hidden"
        id="property-photo-input"
      />

      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="mb-6 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#B8956A]/35 bg-[#FFFBF5] px-4 py-10 text-sm text-[#1A1A1A]/55 hover:border-[#B8956A]"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#B8956A]" />
          ) : (
            <ImagePlus className="h-6 w-6 text-[#B8956A]" />
          )}
          {uploading ? "Uploading…" : "Add photographs"}
        </button>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {photos.map((photo) => (
              <div
                key={photo.drive_file_id}
                className={`relative overflow-hidden rounded-lg border ${
                  coverId === photo.drive_file_id
                    ? "border-[#B8956A] ring-2 ring-[#B8956A]/40"
                    : "border-black/10"
                }`}
              >
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                {coverId === photo.drive_file_id && (
                  <span className="absolute left-1 top-1 rounded bg-[#B8956A] px-1.5 py-0.5 text-[10px] font-bold text-[#1A1A1A]">
                    Cover
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setPhotos((prev) => prev.filter((p) => p.drive_file_id !== photo.drive_file_id))
                  }
                  className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white hover:bg-black/75"
                  aria-label={`Remove ${photo.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-[#B8956A]/35 bg-[#FFFBF5] text-[#B8956A] hover:border-[#B8956A]"
                aria-label="Add more photographs"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
            )}
          </div>

          <div className="mb-5 space-y-2">
            <h3 className="text-sm font-medium text-[#1A1A1A]">Order and cover</h3>
            {photos.map((photo, index) => (
              <div
                key={photo.drive_file_id}
                className="flex items-center gap-3 rounded-lg border border-black/5 bg-[#FFFBF5] px-3 py-2"
              >
                <span className="w-5 text-xs text-[#1A1A1A]/40">{index + 1}</span>
                <span className="flex-1 truncate text-sm text-[#1A1A1A]">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => setCoverId(photo.drive_file_id)}
                  className={`rounded px-2 py-1 text-xs ${
                    coverId === photo.drive_file_id
                      ? "bg-[#B8956A] font-semibold text-[#1A1A1A]"
                      : "text-[#1A1A1A]/50 hover:bg-black/5"
                  }`}
                >
                  <Star className="mr-1 inline h-3 w-3" />Cover
                </button>
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  className="p-1 text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <Button
        onClick={save}
        disabled={busy === "save_uploaded_media" || photos.length === 0}
        className="bg-[#B8956A] text-[#1A1A1A] hover:bg-[#A68559]"
      >
        {busy === "save_uploaded_media" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save photographs
      </Button>
    </section>
  );
}