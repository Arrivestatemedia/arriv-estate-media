import React from "react";
import { useFinalEditsUpload } from "@/components/editing/FinalEditsUploadContext";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, X, Upload } from "lucide-react";

/**
 * Floating banner showing any in-progress (or recently finished) final-edits
 * uploads, so the user can close the modal and still see status on the page.
 */
export default function FinalEditsUploadStatusBanner() {
  const { uploads, clearUpload } = useFinalEditsUpload();
  const entries = Object.entries(uploads);
  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-80 max-w-[calc(100vw-2rem)] space-y-2">
      {entries.map(([taskId, u]) => {
        const isActive = u.status === "preparing" || u.status === "uploading";
        return (
          <div
            key={taskId}
            className="rounded-xl border border-[#B8956A]/30 bg-[#1A1A1A] shadow-lg overflow-hidden"
          >
            <div className="flex items-start gap-2 p-3">
              <div className="shrink-0 mt-0.5">
                {isActive ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#B8956A]" />
                ) : u.status === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#FFFBF5] flex items-center gap-1">
                  <Upload className="w-3 h-3 text-[#B8956A]" />
                  Final edits upload
                </p>
                <p className="text-xs text-[#FFFBF5]/60 truncate mt-0.5">
                  {u.fileNames?.length || 0} file{(u.fileNames?.length || 0) !== 1 ? "s" : ""}
                  {u.folderUrl && u.status === "done" && " · delivered to Drive"}
                </p>
                {u.status === "preparing" && (
                  <div className="mt-1.5 h-1 bg-[#B8956A]/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#B8956A] transition-all duration-200"
                      style={{ width: `${u.progress.total ? (u.progress.done / u.progress.total) * 100 : 0}%` }}
                    />
                  </div>
                )}
                {u.status === "uploading" && (
                  <>
                    <p className="text-xs text-[#B8956A] flex items-center gap-1 mt-1">
                      <Sparkles className="w-3 h-3" />
                      AI classifying + uploading to Drive...
                    </p>
                    <div className="mt-1.5 h-1 bg-[#B8956A]/20 rounded-full overflow-hidden">
                      <div className="block h-full w-1/3 bg-[#B8956A] rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]" />
                    </div>
                  </>
                )}
                {u.status === "error" && (
                  <p className="text-xs text-red-400 mt-1 truncate">{u.error}</p>
                )}
              </div>
              {!isActive && (
                <button
                  onClick={() => clearUpload(taskId)}
                  className="shrink-0 text-[#FFFBF5]/40 hover:text-[#FFFBF5] p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}