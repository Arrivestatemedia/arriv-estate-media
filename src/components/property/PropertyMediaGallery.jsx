import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Play, X, ChevronLeft, ChevronRight, Zap } from "lucide-react";

// The property's approved media, presented the way the delivery gallery presents it: a framed
// hero, gold-ringed media cards that lift on hover, and a full-screen lightbox with arrow-key
// navigation. Only the customer-approved selection ever reaches this component.
export default function PropertyMediaGallery({ photos, videoUrl, address, coverUrl }) {
  const [index, setIndex] = useState(null);
  // Eight photographs are shown before the gallery offers the rest, so the property facts and the
  // inquiry form stay close to the top on a phone. The viewer keeps the whole approved sequence.
  const [showAll, setShowAll] = useState(false);
  const visiblePhotos = showAll ? photos : photos.slice(0, 8);

  const close = useCallback(() => setIndex(null), []);
  const step = useCallback((delta) => {
    setIndex((prev) => (prev == null || photos.length === 0 ? prev : (prev + delta + photos.length) % photos.length));
  }, [photos.length]);

  // Swipe left / right inside the viewer, so a phone visitor moves between photographs
  // without closing it and tapping another thumbnail.
  const touchStart = useRef({ x: 0, y: 0 });
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  };

  useEffect(() => {
    if (index == null) return;
    const handler = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, close, step]);

  const cover = coverUrl || photos[0]?.url;
  const hasMedia = !!cover || !!videoUrl || photos.length > 0;
  if (!hasMedia) return null;

  return (
    <div className="mb-12">
      {cover && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 mb-4"
        >
          <img src={cover} alt={photos[0]?.alt_text || address} className="w-full aspect-video object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-black/50 backdrop-blur-md text-white/90 border border-white/10">
            Cover photograph
          </span>
        </motion.div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
          <ImageIcon className="w-3.5 h-3.5 text-[#B8956A]" />
          <span className="text-xs font-medium text-white/70">{photos.length} Photos</span>
        </div>
        {videoUrl && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Play className="w-3.5 h-3.5 text-[#B8956A]" />
            <span className="text-xs font-medium text-white/70">Video tour</span>
          </div>
        )}
        <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent ml-2" />
      </div>

      {visiblePhotos.length > 0 && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
          {visiblePhotos.map((p, i) => (
            <motion.button
              key={p.drive_file_id}
              type="button"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setIndex(i)}
              className="group relative block w-full break-inside-avoid rounded-2xl overflow-hidden ring-1 ring-white/10 hover:ring-[#B8956A]/40 transition-all duration-300 text-left"
            >
              <img
                src={p.url}
                alt={p.alt_text || p.name}
                loading="lazy"
                className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
              <span className="absolute bottom-0 left-0 right-0 p-3 text-xs font-medium text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {p.alt_text || p.name}
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {photos.length > visiblePhotos.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full mt-4 py-4 rounded-full text-sm font-semibold text-white border border-[#B8956A]/45 bg-[#B8956A]/10 hover:bg-[#B8956A]/20 transition-colors"
        >
          View all {photos.length} photographs
        </button>
      )}

      {videoUrl && (
        <div className="mt-6 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-gradient-to-br from-[#1a1d24] to-[#0a0b0f]">
          <video controls preload="metadata" src={videoUrl} className="w-full aspect-video bg-black" />
        </div>
      )}

      {photos.length > 1 && (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/30">
            <Zap className="w-3 h-3 text-[#B8956A]" />
            Click a photo to view it full size · Swipe or use the arrows to go back and forth
          </div>
        </div>
      )}

      <AnimatePresence>
        {index !== null && photos[index] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center"
            onClick={close}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <button
              onClick={close}
              className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); step(-1); }}
                  className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); step(1); }}
                  className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors z-10"
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </>
            )}

            <motion.img
              key={photos[index].drive_file_id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              src={photos[index].url}
              alt={photos[index].alt_text || photos[index].name}
              className="w-full h-full max-w-[95vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
              <p className="text-sm text-white/90">
                {photos[index].alt_text || photos[index].name} · {index + 1} / {photos.length}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}