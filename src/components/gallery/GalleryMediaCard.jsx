import React from "react";
import { motion } from "framer-motion";
import { ImageIcon, Video, FileText, Download, Check, Youtube, Copy } from "lucide-react";

/**
 * One media tile in the delivery gallery.
 *
 * Clicking the photograph still opens the lightbox and clicking a video still toggles it — the
 * only new control is the always-visible checkbox, which stops propagation so selecting never
 * opens a preview. Both Download Selected and Publish to MLS read this same selection.
 */
export default function GalleryMediaCard({
  file,
  index,
  isSelected,
  onToggleSelect,
  onOpen,
  onDownload,
  formatSize,
  youtube,
  copiedVideo,
  onCopyYoutube,
  showYoutube,
}) {
  const isImg = file.isImage;
  const ytReady = !!youtube?.youtube_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5), ease: [0.22, 1, 0.36, 1] }}
      className={`group relative break-inside-avoid rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
        isSelected
          ? "ring-2 ring-[#B8956A] shadow-lg shadow-[#B8956A]/30"
          : "ring-1 ring-white/10 hover:ring-[#B8956A]/40"
      }`}
      onClick={() => (isImg ? onOpen() : onToggleSelect())}
    >
      <div className="relative bg-white/5 overflow-hidden">
        {isImg && file.thumbnailLink ? (
          <img
            src={file.thumbnailLink}
            alt={file.name}
            className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
          />
        ) : isImg ? (
          <div className="aspect-square flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-[#B8956A]/40" />
          </div>
        ) : file.isVideo ? (
          <div className="aspect-video flex items-center justify-center bg-gradient-to-br from-[#1a1d24] to-[#0a0b0f]">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-[#B8956A]/20 flex items-center justify-center backdrop-blur-sm border border-[#B8956A]/30 group-hover:bg-[#B8956A]/30 transition-colors">
                <div className="w-0 h-0 border-l-[12px] border-l-[#B8956A] border-y-[8px] border-y-transparent ml-1" />
              </div>
              <div className="absolute inset-0 rounded-full bg-[#B8956A]/20 blur-xl -z-10 group-hover:bg-[#B8956A]/30 transition-colors" />
            </div>
          </div>
        ) : (
          <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-[#1a1d24] to-[#0a0b0f]">
            <FileText className="w-10 h-10 text-[#B8956A]/40" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

        <div className="absolute top-3 left-3">
          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-black/50 backdrop-blur-md text-white/90 border border-white/10">
            {isImg ? "Photo" : file.isVideo ? "Video" : "Doc"}
          </span>
        </div>

        {/* Always-visible selection checkbox. Clicking it never opens the lightbox. */}
        <button
          type="button"
          aria-label={isSelected ? `Deselect ${file.name}` : `Select ${file.name}`}
          aria-pressed={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 border shadow-sm ${
            isSelected
              ? "bg-[#B8956A] border-[#B8956A]"
              : "bg-black/50 backdrop-blur-md border-white/40 hover:bg-black/70"
          }`}
        >
          {isSelected && <Check className="w-4 h-4 text-[#0a0b0f]" />}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          aria-label={`Download ${file.name}`}
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-[#B8956A] hover:border-[#B8956A] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
        >
          <Download className="w-4 h-4 text-white group-hover:text-[#0a0b0f] transition-colors" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-3 pr-12">
          <p className="text-xs font-medium text-white truncate">{file.name}</p>
          {file.size && (
            <p className="text-[10px] text-white/40">{formatSize(parseInt(file.size))}</p>
          )}
          {file.isVideo && showYoutube && (
            ytReady ? (
              <div className="mt-1 flex items-center gap-2">
                <a
                  href={youtube.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] font-medium text-[#D9BB92] hover:text-white transition-colors"
                >
                  <Youtube className="w-3 h-3" /> Watch on YouTube
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyYoutube(youtube.youtube_url);
                  }}
                  className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white transition-colors"
                >
                  {copiedVideo === youtube.youtube_url ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedVideo === youtube.youtube_url ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : (
              <p className="mt-1 text-[10px] text-white/40 italic">Preparing Unbranded Video Link</p>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
}