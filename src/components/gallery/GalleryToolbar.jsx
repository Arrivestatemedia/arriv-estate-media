import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ImageIcon, Video, FileText, Download, Check, CheckCheck, Loader2, ShieldCheck } from "lucide-react";

/**
 * The gallery toolbar: what is in the delivery, how much of it is selected, and the two actions
 * that use that one selection — Download Selected and Publish to MLS.
 */
export default function GalleryToolbar({
  photoCount,
  videoCount,
  docCount,
  fileCount,
  selectedCount,
  allSelected,
  onToggleAll,
  onDownload,
  downloading,
  downloadStep,
  onPublishMls,
  canPublishMls,
}) {
  const progressLabel = downloadStep?.total > 1
    ? `${Math.min(downloadStep.done + 1, downloadStep.total)} of ${downloadStep.total}`
    : "Downloading...";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
          <ImageIcon className="w-3.5 h-3.5 text-[#B8956A]" />
          <span className="text-xs font-medium text-white/70">{photoCount} Photos</span>
        </div>
        {videoCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Video className="w-3.5 h-3.5 text-[#B8956A]" />
            <span className="text-xs font-medium text-white/70">{videoCount} Videos</span>
          </div>
        )}
        {docCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <FileText className="w-3.5 h-3.5 text-[#B8956A]" />
            <span className="text-xs font-medium text-white/70">{docCount} Files</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onToggleAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-[#B8956A] hover:bg-[#B8956A]/10 transition-colors"
        >
          {allSelected && fileCount > 0 ? <CheckCheck className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {allSelected && fileCount > 0 ? "Deselect All" : "Select All"}
        </button>
        <span className="text-xs text-white/30">
          {selectedCount > 0 ? `${selectedCount} selected` : `${fileCount} files`}
        </span>

        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 10 }}
              className="flex flex-wrap items-center gap-2"
            >
              <Button
                onClick={onDownload}
                disabled={downloading}
                className="bg-gradient-to-r from-[#B8956A] to-[#8a6d4a] hover:from-[#C9A87B] hover:to-[#9a7d5a] text-[#0a0b0f] rounded-full font-semibold shadow-lg shadow-[#B8956A]/30"
                size="sm"
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {progressLabel}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download {selectedCount}
                  </>
                )}
              </Button>
              {canPublishMls && (
                <Button
                  onClick={onPublishMls}
                  disabled={downloading}
                  variant="outline"
                  size="sm"
                  className="rounded-full border-[#B8956A]/50 text-[#D9BB92] hover:bg-[#B8956A]/10 hover:text-white"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Publish to MLS
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}