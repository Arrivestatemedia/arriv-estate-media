import React from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Trash2, Film, Loader2 } from "lucide-react";

export default function RecordingsPanel({ isOpen, onClose, recordings, onDelete }) {
  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 max-w-[85%] bg-gray-900/95 backdrop-blur border-l border-gray-700 z-[10] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-white" />
          <span className="text-white font-semibold text-sm">Recordings</span>
          {recordings.length > 0 && (
            <span className="text-xs text-gray-400">({recordings.length})</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Film className="w-10 h-10 text-gray-600 mb-2" />
            <p className="text-sm text-gray-500">No recordings yet</p>
            <p className="text-xs text-gray-600 mt-1">Click the record button to start</p>
          </div>
        ) : (
          recordings.map((rec) => (
            <div key={rec.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
              {rec.uploading ? (
                <div className="w-full h-32 bg-black flex flex-col items-center justify-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mb-1" />
                  <span className="text-xs">Uploading…</span>
                  <span className="text-[10px] text-gray-500 mt-1">Video is saved locally</span>
                </div>
              ) : (
                <video
                  src={rec.url}
                  controls
                  className="w-full h-32 bg-black object-contain"
                />
              )}
              <div className="p-2">
                <p className="text-xs text-gray-300 font-medium">{rec.label}</p>
                <p className="text-[10px] text-gray-500">
                  {rec.duration} · {(rec.size / 1024 / 1024).toFixed(1)} MB
                </p>
                {rec.cloudFailed && (
                  <p className="text-[10px] text-amber-400 mb-1">
                    Cloud upload failed — download to keep this recording
                  </p>
                )}
                {rec.cloudSaved && (
                  <p className="text-[10px] text-green-400 mb-1">
                    ✓ Saved to cloud
                  </p>
                )}
                <div className="flex gap-1 mt-2">
                  <a
                    href={rec.url}
                    download={`recording-${rec.id}.webm`}
                    className="flex-1"
                  >
                    <Button size="sm" variant="outline" className="w-full h-7 text-xs border-gray-600 text-gray-300 hover:bg-gray-700" disabled={rec.uploading}>
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(rec.id)}
                    className="h-7 px-2 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}